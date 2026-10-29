$ErrorActionPreference = 'Stop'
$repo = 'D:\AI\ComfyUI-H3\ComfyUI_windows_portable\ComfyUI\custom_nodes\ComfyUI-GGUF'
$target = Join-Path $repo 'tools\convert.py'
if (!(Test-Path -LiteralPath $target)) { throw 'ComfyUI-GGUF is not installed' }
$source = Get-Content -LiteralPath $target -Raw -Encoding UTF8
if ($source.Contains('class ModelQwenImage21(ModelTemplate):')) { Write-Output 'Qwen Image 2.1 detector already present'; exit 0 }
$anchor = 'arch_list = [ModelFlux, ModelSD3, ModelAura, ModelHiDream, CosmosPredict2, '
if (!$source.Contains($anchor)) { throw 'Unexpected ComfyUI-GGUF converter version; patch not applied' }
$addition = @'
class ModelQwenImage21(ModelTemplate):
    arch = "qwen_image21"
    keys_detect = [(
        "txt_in.text_norm.weight", "modulation.1.weight",
        "transformer_blocks.0.attn.norm_q.weight", "img_in.weight",
        "proj_out.weight", "transformer_blocks.0.img_mlp.gate_up.weight",
    )]

'@
$updated = $source.Replace($anchor, $addition + $anchor).Replace('ModelWan, ModelSDXL, ModelSD1, ModelLumina2]', 'ModelWan, ModelSDXL, ModelSD1, ModelLumina2, ModelQwenImage21]')
if ($updated -eq $source) { throw 'Patch did not change converter' }
$backup = "$target.before-qwen21.bak"
if (!(Test-Path -LiteralPath $backup)) { Copy-Item -LiteralPath $target -Destination $backup }
[IO.File]::WriteAllText($target, $updated, [Text.UTF8Encoding]::new($false))
Write-Output "Patched $target; backup: $backup"
