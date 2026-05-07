[CmdletBinding()]
param(
    [string]$ConfigFile = ".env.deploy-button",
    [switch]$FullReset
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-ConfigPath {
    param(
        [string]$ScriptDir,
        [string]$RepositoryRoot,
        [string]$PathValue
    )

    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return $PathValue
    }

    $repoCandidate = Join-Path $RepositoryRoot $PathValue
    if (Test-Path $repoCandidate) {
        return $repoCandidate
    }

    return (Join-Path $ScriptDir $PathValue)
}

function Load-EnvFile {
    param([string]$PathValue)

    if (-not (Test-Path $PathValue)) {
        throw "Deploy config file was not found: $PathValue"
    }

    $values = @{}
    foreach ($line in Get-Content $PathValue) {
        $trimmed = $line.Trim()
        if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
            continue
        }

        $separatorIndex = $line.IndexOf("=")
        if ($separatorIndex -lt 1) {
            continue
        }

        $key = $line.Substring(0, $separatorIndex).Trim()
        $value = $line.Substring($separatorIndex + 1).Trim()
        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$key] = $value
    }

    return $values
}

function Get-Setting {
    param(
        [hashtable]$Config,
        [string]$Key,
        [string]$DefaultValue = "",
        [switch]$Required
    )

    if ($Config.ContainsKey($Key) -and -not [string]::IsNullOrWhiteSpace($Config[$Key])) {
        return $Config[$Key]
    }

    $environmentValue = [Environment]::GetEnvironmentVariable($Key)
    if (-not [string]::IsNullOrWhiteSpace($environmentValue)) {
        return $environmentValue
    }

    if ($Required) {
        throw "Missing required deploy setting: $Key"
    }

    return $DefaultValue
}

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command was not found in PATH: $Name"
    }
}

function Quote-ForSh {
    param([string]$Value)

    return "'" + $Value.Replace("'", "'""'""'") + "'"
}

function Invoke-Ssh {
    param(
        [string]$UserHost,
        [string]$Port,
        [string]$RemoteCommand
    )

    $arguments = @(
        "-p", $Port,
        "-o", "ServerAliveInterval=30",
        "-o", "ServerAliveCountMax=10",
        $UserHost,
        $RemoteCommand
    )

    return (& ssh @arguments)
}

function Wait-RemoteDeploy {
    param(
        [string]$UserHost,
        [string]$Port,
        [string]$RemoteLog,
        [string]$RemoteExit,
        [int]$Attempts = 330,
        [int]$WaitSeconds = 10
    )

    $quotedRemoteLog = Quote-ForSh $RemoteLog
    $quotedRemoteExit = Quote-ForSh $RemoteExit
    $statusPrefix = "__STATUS__:"

    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        $remoteCommand = "status=''; if [ -f $quotedRemoteExit ]; then status=`$(cat $quotedRemoteExit); fi; echo `"$statusPrefix`$status`"; tail -n 60 $quotedRemoteLog 2>/dev/null || true"
        $output = Invoke-Ssh -UserHost $UserHost -Port $Port -RemoteCommand $remoteCommand
        $output | ForEach-Object { Write-Host $_ }

        $statusLine = $output | Where-Object { $_ -like "$statusPrefix*" } | Select-Object -Last 1
        if ($null -ne $statusLine) {
            $statusValue = $statusLine.Substring($statusPrefix.Length)
            if (-not [string]::IsNullOrWhiteSpace($statusValue)) {
                if ($statusValue -ne "0") {
                    throw "Remote deployment failed with exit code $statusValue"
                }
                return
            }
        }

        Start-Sleep -Seconds $WaitSeconds
    }

    throw "Timed out waiting for remote deployment to finish"
}

function Verify-PublicRevision {
    param(
        [string]$UserHost,
        [string]$Port,
        [string]$AppDir,
        [string]$PublicBaseUrl,
        [int]$Attempts = 18,
        [int]$WaitSeconds = 10
    )

    $quotedAppDir = Quote-ForSh $AppDir
    $expectedRevision = (Invoke-Ssh -UserHost $UserHost -Port $Port -RemoteCommand "cd $quotedAppDir && git rev-parse HEAD" | Select-Object -Last 1).Trim()
    if ([string]::IsNullOrWhiteSpace($expectedRevision)) {
        throw "Could not resolve deployed revision on the server"
    }

    $baseUrl = $PublicBaseUrl.TrimEnd("/")
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            $payload = Invoke-RestMethod -Method Get -TimeoutSec 20 -Uri "$baseUrl/build-meta.json"
            $publicRevision = [string]$payload.revision
            $builtAt = [string]$payload.builtAt

            if (-not [string]::IsNullOrWhiteSpace($publicRevision) -and $publicRevision -eq $expectedRevision) {
                Write-Host "Verified public revision $publicRevision built at $builtAt"
                return
            }
        } catch {
            Write-Host "Public revision check attempt $attempt/$Attempts is not ready yet."
        }

        Start-Sleep -Seconds $WaitSeconds
    }

    throw "Public deployment never exposed revision $expectedRevision"
}

$scriptDirectory = Split-Path -Parent $PSCommandPath
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDirectory ".."))
$resolvedConfigFile = Resolve-ConfigPath -ScriptDir $scriptDirectory -RepositoryRoot $repositoryRoot -PathValue $ConfigFile
$config = Load-EnvFile -PathValue $resolvedConfigFile

$hostName = Get-Setting -Config $config -Key "PROD_SSH_HOST" -Required
$port = Get-Setting -Config $config -Key "PROD_SSH_PORT" -DefaultValue "22"
$userName = Get-Setting -Config $config -Key "PROD_SSH_USER" -DefaultValue "deploy"
$appDirectory = Get-Setting -Config $config -Key "PROD_APP_DIR" -DefaultValue "/opt/messenger-app"
$publicBaseUrl = Get-Setting -Config $config -Key "PROD_PUBLIC_BASE_URL" -Required

Require-Command -Name "ssh"
Require-Command -Name "scp"

$userHost = "$userName@$hostName"
$remoteScript = "/tmp/messenger-remote-update.sh"
$remoteLog = "/tmp/messenger-remote-update.log"
$remoteExit = "/tmp/messenger-remote-update.exit"
$localRemoteUpdateScript = Join-Path $scriptDirectory "remote-update.sh"

if (-not (Test-Path $localRemoteUpdateScript)) {
    throw "Local deploy helper was not found: $localRemoteUpdateScript"
}

Write-Host "Uploading deploy script to $userHost"
& scp `
    "-P" $port `
    "-o" "ServerAliveInterval=30" `
    "-o" "ServerAliveCountMax=10" `
    $localRemoteUpdateScript `
    "${userHost}:${remoteScript}"

$quotedRemoteScript = Quote-ForSh $remoteScript
$quotedRemoteLog = Quote-ForSh $remoteLog
$quotedRemoteExit = Quote-ForSh $remoteExit
$quotedPublicBaseUrl = Quote-ForSh $publicBaseUrl
$quotedPublicIp = Quote-ForSh $hostName
$quotedAppDirectory = Quote-ForSh $appDirectory
$quotedFullReset = Quote-ForSh ($(if ($FullReset.IsPresent) { "true" } else { "false" }))

$launchCommand = "rm -f $quotedRemoteLog $quotedRemoteExit && chmod +x $quotedRemoteScript && nohup env DEPLOY_STATUS_FILE=$quotedRemoteExit PROD_PUBLIC_BASE_URL=$quotedPublicBaseUrl PROD_PUBLIC_IP=$quotedPublicIp FULL_RESET=$quotedFullReset $quotedRemoteScript $quotedAppDirectory > $quotedRemoteLog 2>&1 </dev/null &"

Write-Host "Starting remote deployment on $userHost"
Invoke-Ssh -UserHost $userHost -Port $port -RemoteCommand $launchCommand | Out-Null

Wait-RemoteDeploy -UserHost $userHost -Port $port -RemoteLog $remoteLog -RemoteExit $remoteExit
Verify-PublicRevision -UserHost $userHost -Port $port -AppDir $appDirectory -PublicBaseUrl $publicBaseUrl

Write-Host "Deployment finished successfully."
