# بيعمل أدمن تجريبي على المحاكي المحلي فقط (مش على Firebase الحقيقي).
# شغّل المحاكي أول:  firebase emulators:start --project demo-bitlahia
# بعدين:            powershell -File scripts/seed-emulator.ps1
# وادخل على http://localhost:5000/admin بالإيميل وكلمة السر اللي تحت.

$Email    = 'admin@test.local'
$Password = 'emulator-only-123'
$Project  = 'demo-bitlahia'

$signup = Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key" `
  -ContentType 'application/json' `
  -Body (@{ email = $Email; password = $Password; returnSecureToken = $true } | ConvertTo-Json)

$uid = $signup.localId
Invoke-RestMethod -Method Patch `
  -Uri "http://127.0.0.1:8080/v1/projects/$Project/databases/(default)/documents/admins/$uid" `
  -Headers @{ Authorization = 'Bearer owner' } -ContentType 'application/json' `
  -Body '{"fields":{"role":{"stringValue":"admin"}}}' | Out-Null

Write-Output "Admin created on emulator: $Email (uid $uid)"
