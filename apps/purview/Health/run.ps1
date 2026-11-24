param($Request, $TriggerMetadata)

Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
    StatusCode = 200
    Headers = @{ 'Content-Type' = 'application/json'; 'Cache-Control' = 'no-store' }
    Body = '{"service":"purview-collector","status":"ok"}'
})
