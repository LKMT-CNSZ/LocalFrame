import argparse
import io
import json
import os
import re
import sys
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import torch


def split_for_natural_delivery(text, max_chars=110):
    """Keep short multi-sentence speech continuous; split only when it is long."""
    sentences = [item for item in re.split(r"(?<=[。！？!?；;])", text) if item.strip()]
    segments = []
    current = ""
    for sentence in sentences or [text]:
        sentence = sentence.strip()
        if current and len(current) + len(sentence) <= max_chars:
            current += sentence
            continue
        if current:
            segments.append(current)
            current = ""
        while len(sentence) > max_chars:
            candidates = [match.end() for match in re.finditer(r"[，,、：:]", sentence[:max_chars + 1])]
            cut = candidates[-1] if candidates else max_chars
            segments.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        if sentence:
            current = sentence
    if current:
        segments.append(current)
    return segments or [text]


def trim_outer_silence(audio, sample_rate):
    if audio.numel() == 0:
        return audio
    envelope = audio.detach().abs()
    if envelope.ndim > 1:
        envelope = envelope.amax(dim=0)
    active = torch.nonzero(envelope > 0.0015, as_tuple=False).flatten()
    if active.numel() == 0:
        return audio
    start = max(0, int(active[0]) - int(sample_rate * 0.035))
    end = min(audio.shape[-1], int(active[-1]) + int(sample_rate * 0.065) + 1)
    return audio[..., start:end]


def soften_edges(audio, sample_rate):
    frames = min(int(sample_rate * 0.008), audio.shape[-1] // 2)
    if frames <= 1:
        return audio
    result = audio.clone()
    fade_in = torch.linspace(0.0, 1.0, frames, device=result.device, dtype=result.dtype)
    result[..., :frames] *= fade_in
    result[..., -frames:] *= fade_in.flip(0)
    return result


def finish_audio(audio):
    # Preserve intentional quiet delivery while preventing hard digital clips.
    audio = audio - audio.mean()
    peak = float(audio.detach().abs().max()) if audio.numel() else 0.0
    if peak > 0.96:
        audio = audio * (0.96 / peak)
    return audio


def wav_bytes(audio, sample_rate):
    values = audio.detach().cpu().float().numpy().reshape(-1)
    values = np.clip(values, -1.0, 1.0)
    pcm = (values * 32767.0).astype(np.int16)
    output = io.BytesIO()
    with wave.open(output, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())
    return output.getvalue()


def build_handler(model, load_wav):
    class Handler(BaseHTTPRequestHandler):
        server_version = "LocalFrameVoice/1.0"

        def log_message(self, fmt, *args):
            print(fmt % args, flush=True)

        def send_json(self, status, value):
            data = json.dumps(value, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == "/health":
                self.send_json(200, {"ready": True, "model": "CosyVoice-300M-Instruct"})
                return
            if self.path == "/voices":
                self.send_json(200, {"speakers": model.list_available_spks()})
                return
            self.send_json(404, {"error": "not found"})

        def do_POST(self):
            if self.path != "/synthesize":
                self.send_json(404, {"error": "not found"})
                return
            try:
                size = min(65536, int(self.headers.get("Content-Length", "0")))
                body = json.loads(self.rfile.read(size).decode("utf-8"))
                text = str(body.get("text", "")).strip()[:2000]
                speaker = str(body.get("speaker", "中文女"))
                instruction = str(body.get("instruction", "自然、清晰地说话。"))[:500]
                speed = min(1.5, max(0.6, float(body.get("speed", 1.0))))
                pause_scale = min(1.5, max(0.65, float(body.get("pauseScale", 1.0))))
                variation = min(0.02, max(0.0, float(body.get("variation", 0.008))))
                custom_voice = body.get("customVoice") if isinstance(body.get("customVoice"), dict) else None
                if not text:
                    raise ValueError("语音文字不能为空")
                speech_parts = []
                segments = split_for_natural_delivery(text)
                tempo_pattern = (0.0, 0.65, -0.45, 0.35, -0.2)
                for index, segment in enumerate(segments):
                    segment_speed = min(1.5, max(0.6, speed * (1.0 + variation * tempo_pattern[index % len(tempo_pattern)])))
                    if custom_voice:
                        reference_path = os.path.abspath(str(custom_voice.get("referencePath", "")))
                        prompt_text = str(custom_voice.get("promptText", "")).strip()[:1000]
                        if not os.path.isfile(reference_path) or not prompt_text:
                            raise ValueError("自定义声音参考音频或参考文本无效")
                        prompt_audio = load_wav(reference_path, 16000)
                        try:
                            iterator = model.inference_zero_shot(segment, prompt_text, prompt_audio, stream=False, speed=segment_speed)
                        except TypeError:
                            iterator = model.inference_zero_shot(segment, prompt_text, prompt_audio, stream=False)
                        generated = [item["tts_speech"] for item in iterator]
                    else:
                        generated = [item["tts_speech"] for item in model.inference_instruct(
                            segment, speaker, instruction, stream=False, speed=segment_speed
                        )]
                    if not generated:
                        continue
                    part = torch.cat(generated, dim=-1)
                    if len(segments) > 1:
                        part = soften_edges(trim_outer_silence(part, model.sample_rate), model.sample_rate)
                    speech_parts.append(part)
                    if index < len(segments) - 1:
                        pause_ms = 235 if re.search(r"[。！？!?]$", segment) else 125
                        silence_frames = int(model.sample_rate * pause_ms * pause_scale / 1000.0)
                        speech_parts.append(torch.zeros((*part.shape[:-1], silence_frames), device=part.device, dtype=part.dtype))
                if not speech_parts:
                    raise RuntimeError("模型没有返回音频")
                data = wav_bytes(finish_audio(torch.cat(speech_parts, dim=-1)), model.sample_rate)
                self.send_response(200)
                self.send_header("Content-Type", "audio/wav")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception as error:
                self.send_json(400, {"error": str(error)})

    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=7865)
    parser.add_argument("--source", required=True)
    parser.add_argument("--model", required=True)
    args = parser.parse_args()
    print("[startup] preparing local CosyVoice imports", flush=True)
    sys.path.insert(0, args.source)
    sys.path.insert(0, os.path.join(args.source, "third_party", "Matcha-TTS"))
    # WeText attempts to download optional FST data during first startup. Keep
    # the desktop engine deterministic and offline; CosyVoice's built-in
    # Chinese sentence cleanup remains active without this optional module.
    sys.modules["wetext"] = None
    from cosyvoice.cli.cosyvoice import AutoModel
    from cosyvoice.utils.file_utils import load_wav
    print(f"[startup] loading CosyVoice model from {args.model}", flush=True)
    model = AutoModel(model_dir=args.model)
    print("[startup] CosyVoice model loaded", flush=True)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), build_handler(model, load_wav))
    print(f"LocalFrame CosyVoice listening on 127.0.0.1:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
