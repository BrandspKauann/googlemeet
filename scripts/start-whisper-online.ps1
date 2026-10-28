param([ValidateSet('base','small','turbo','large-v3')][string]$Model='large-v3',
      [ValidateSet('cpu','cuda')][string]$Device='cuda')
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
$composeArgs=@('compose','--env-file',$configPath,'-f','docker/compose.whisper.yml')
if($Device -eq 'cuda'){$composeArgs+=@('-f','docker/compose.gpu.yml')}
docker @composeArgs --profile quick up -d --build
if($LASTEXITCODE -ne 0){throw 'Não foi possível iniciar o Docker do reconhecimento.'}
$endpoint=$null
for($attempt=0;$attempt -lt 60;$attempt++){
  $tunnelLog=docker @composeArgs logs --no-color --tail 100 tunnel 2>&1 | Out-String
  $found=[regex]::Matches($tunnelLog,'https://[a-z0-9-]+\.trycloudflare\.com')
  if($found.Count -gt 0){$endpoint=$found[$found.Count-1].Value;break}
  Start-Sleep -Seconds 2
}
if(!$endpoint){throw 'O túnel não abriu. Verifique os logs do serviço tunnel.'}
[IO.File]::WriteAllText((Join-Path $projectDir '.env.whisper.endpoint.local'),"ASR_URL=$endpoint`n")
Write-Output "Servidor online: $endpoint"
Write-Output 'A chave ficou somente em .env.whisper.local. O endereço temporário muda ao recriar o túnel.'
