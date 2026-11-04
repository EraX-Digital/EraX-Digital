$ErrorActionPreference = "Stop"
if ($env:ERAX_APPROVE_SOLANA_DEPLOY -ne "devnet") {
  Write-Error "Devnet deployment is not approved. Set ERAX_APPROVE_SOLANA_DEPLOY=devnet only after an explicit approval."
  exit 1
}
Write-Error "The approved deploy command is documented in docs/SOLANA_DEPLOYMENT_GUIDE.md. This script does not broadcast."
exit 1
