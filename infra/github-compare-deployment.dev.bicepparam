using './github-api-deployment.bicep'
param location = 'westus2'
param environmentName = 'dev'
param functionAppName = 'nso-audit-dev-compare'
param deploymentIdentityName = 'nso-audit-dev-compare-deploy'
param githubRepository = 'kapblaubar/nso-audit'
param githubEnvironment = 'development'

// Exact subject observed in the Dev GitHub Actions Azure login assertion.
param githubSubject = 'repo:kapblaubar@95560298/nso-audit@1333451275:environment:development'

