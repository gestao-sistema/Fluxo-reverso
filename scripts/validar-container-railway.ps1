[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCommand) {
  throw 'Docker CLI não encontrado. O script não criou nem alterou recursos.'
}

$serverVersion = & $dockerCommand.Source info --format '{{.ServerVersion}}' 2>$null
if ($LASTEXITCODE -ne 0 -or -not $serverVersion) {
  throw 'Docker Engine indisponível. Inicie o Docker Desktop/Engine e rode novamente.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$suffix = [guid]::NewGuid().ToString('N').Substring(0, 12)
$imageTag = "flowdesk-reverso-readiness:$suffix"
$containerName = "flowdesk-reverso-readiness-$suffix"
$hostPort = $null
$containerStarted = $false
$imageBuilt = $false
$httpClient = [System.Net.Http.HttpClient]::new()
$httpClient.Timeout = [TimeSpan]::FromSeconds(3)

try {
  for ($candidate = 20000; $candidate -lt 60000; $candidate += 1) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidate)
    try {
      $listener.Start()
      $listener.Stop()
      $hostPort = $candidate
      break
    } catch {
      try { $listener.Stop() } catch { }
    }
  }

  if (-not $hostPort) {
    throw 'Não foi possível reservar uma porta local livre entre 20000 e 59999.'
  }

  Push-Location $repoRoot
  try {
    $buildArgs = @(
      'build',
      '--tag', $imageTag,
      '--file', 'Dockerfile',
      '--build-arg', 'VITE_SUPABASE_URL=https://placeholder.supabase.co',
      '--build-arg', 'VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_validation_only',
      '.'
    )
    & $dockerCommand.Source @buildArgs
    if ($LASTEXITCODE -ne 0) {
      throw 'docker build falhou.'
    }
    $imageBuilt = $true

    $mapping = '127.0.0.1:{0}:8080' -f $hostPort
    & $dockerCommand.Source run --detach --name $containerName --publish $mapping --env 'PORT=8080' $imageTag | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw 'docker run falhou.'
    }
    $containerStarted = $true

    & $dockerCommand.Source exec $containerName nginx -t
    if ($LASTEXITCODE -ne 0) {
      throw 'nginx -t falhou.'
    }

    $baseUrl = 'http://127.0.0.1:{0}' -f $hostPort
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
      try {
        $response = $httpClient.GetAsync("$baseUrl/healthz").GetAwaiter().GetResult()
        if ([int]$response.StatusCode -eq 200) {
          $ready = $true
          $response.Dispose()
          break
        }
        $response.Dispose()
      } catch {
        Start-Sleep -Seconds 1
      }
    }
    if (-not $ready) {
      throw 'O container não respondeu 200 em /healthz dentro de 30 segundos.'
    }

    $health = $httpClient.GetAsync("$baseUrl/healthz").GetAwaiter().GetResult()
    $healthBody = $health.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if ($healthBody.Trim() -ne 'ok') {
      throw 'O endpoint /healthz não retornou o corpo esperado.'
    }
    $health.Dispose()

    $home = $httpClient.GetAsync("$baseUrl/").GetAwaiter().GetResult()
    $homeBody = $home.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if ([int]$home.StatusCode -ne 200 -or $home.Content.Headers.ContentType.MediaType -ne 'text/html' -or $homeBody -notmatch 'id="root"') {
      throw 'A rota raiz não retornou o HTML da SPA.'
    }
    $home.Dispose()

    $spa = $httpClient.GetAsync("$baseUrl/admin/alinare").GetAwaiter().GetResult()
    $spaBody = $spa.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if ([int]$spa.StatusCode -ne 200 -or $spaBody -ne $homeBody) {
      throw 'A rota SPA não retornou o mesmo index.html da raiz.'
    }
    $spa.Dispose()

    foreach ($path in @('/assets/inexistente.js', '/api/qualquer')) {
      $response = $httpClient.GetAsync("$baseUrl$path").GetAwaiter().GetResult()
      $status = [int]$response.StatusCode
      $response.Dispose()
      if ($status -ne 404) {
        throw "$path deveria retornar 404, mas retornou $status."
      }
    }

    $runtimePort = & $dockerCommand.Source exec $containerName printenv PORT
    if ($LASTEXITCODE -ne 0 -or ($runtimePort -join '').Trim() -ne '8080') {
      throw 'A variável PORT não chegou ao container com o valor 8080.'
    }

    $publishedPort = & $dockerCommand.Source port $containerName '8080/tcp'
    if ($LASTEXITCODE -ne 0 -or ($publishedPort -join [Environment]::NewLine) -notmatch ("127\.0\.0\.1:{0}$" -f $hostPort)) {
      throw 'A porta do container não está publicada somente em loopback.'
    }

    $buildConfigCommand = "grep -R -F -q 'https://placeholder.supabase.co' /usr/share/nginx/html/assets && grep -R -F -q 'sb_publishable_local_validation_only' /usr/share/nginx/html/assets"
    & $dockerCommand.Source exec $containerName sh -c $buildConfigCommand
    if ($LASTEXITCODE -ne 0) {
      throw 'As variáveis VITE fictícias não chegaram ao bundle.'
    }

    $pattern = 'sb_secret_[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
    $grepCommand = "grep -R -E -q '$pattern' /usr/share/nginx/html/assets"
    & $dockerCommand.Source exec $containerName sh -c $grepCommand 2>$null
    $scanExit = $LASTEXITCODE
    if ($scanExit -eq 0) {
      throw 'O bundle contém um padrão de chave secreta ou JWT; os valores não serão exibidos.'
    }
    if ($scanExit -gt 1) {
      throw 'A verificação segura do bundle falhou.'
    }

    $testRequest = $httpClient.GetAsync("$baseUrl/definir-senha?token_hash=READINESS_TEST&type=recovery").GetAwaiter().GetResult()
    $testRequest.Dispose()
    $logText = (& $dockerCommand.Source logs $containerName 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) {
      throw 'Não foi possível ler os logs do container.'
    }
    if ($logText -match 'token_hash=|READINESS_TEST') {
      throw 'Os logs registraram a query string do link de recuperação.'
    }

    & $dockerCommand.Source restart $containerName | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw 'O container não reiniciou.'
    }

    $readyAfterRestart = $false
    for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
      try {
        $response = $httpClient.GetAsync("$baseUrl/healthz").GetAwaiter().GetResult()
        if ([int]$response.StatusCode -eq 200) {
          $readyAfterRestart = $true
          $response.Dispose()
          break
        }
        $response.Dispose()
      } catch {
        Start-Sleep -Seconds 1
      }
    }
    if (-not $readyAfterRestart) {
      throw 'O container reiniciado não voltou a responder 200 em /healthz.'
    }

    Write-Output 'Docker local aprovado: build, startup, /healthz, SPA, 404, PORT, porta loopback, bundle, logs e restart.'
  } finally {
    Pop-Location
  }
} finally {
  $httpClient.Dispose()
  if ($containerStarted) {
    & $dockerCommand.Source rm --force $containerName 2>$null | Out-Null
  }
  if ($imageBuilt) {
    & $dockerCommand.Source image rm $imageTag 2>$null | Out-Null
  }
}
