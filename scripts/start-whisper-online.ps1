param([ValidateSet('base','small','turbo')][string]$Model='base')
$ErrorActionPreference='Stop'
$projectDir=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectDir
docker info --format '{{.ServerVersion}}' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Abra o Docker Desktop e aguarde o motor iniciar. Depois execute este script novamente.'}
$configPath=Join-Path $projectDir '.env.whisper.local'
if(!(Test-Path -LiteralPath $configPath)){
  $secretBytes=New-Object byte[] 32
  $generator=[Security.Cryptography.RandomNumberGenerator]::Create()
  $generator.GetBytes($secretBytes);$generator.Dispose()
  $secretValue=([BitConverter]::ToString($secretBytes)).Replace('-','').ToLowerInvariant()
  [IO.File]::WriteAllText($configPath,"ASR_SECRET=$secretValue`nASR_MODEL=$Model`n")
}
$env:ASR_MODEL=$Model
docker compose --env-file $configPath -f docker/compose.whisper.yml --profile quick up -d --build
if($LASTEXITCODE -ne 0){throw 'Não foi possível iniciar o Docker do reconhecimento.'}
$endpoint=$null
for($attempt=0;$attempt -lt 60;$attempt++){
  $tunnelLog=docker compose --env-file $configPath -f docker/compose.whisper.yml logs --no-color --tail 100 tunnel 2>&1 | Out-String
  $found=[regex]::Match($tunnelLog,'https://[a-z0-9-]+\.trycloudflare\.com')
  if($found.Success){$endpoint=$found.Value;break}
  Start-Sleep -Seconds 2
}
if(!$endpoint){throw 'O túnel não abriu. Verifique os logs do serviço tunnel.'}
[IO.File]::WriteAllText((Join-Path $projectDir '.env.whisper.endpoint.local'),"ASR_URL=$endpoint`n")
Write-Output "Servidor online: $endpoint"
Write-Output 'A chave ficou somente em .env.whisper.local. O endereço temporário muda ao recriar o túnel.'
