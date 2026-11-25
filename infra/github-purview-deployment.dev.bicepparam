using './github-api-deployment.bicep'

param location = 'westus2'
param environmentName = 'dev'
param functionAppName = 'nso-audit-dev-pur-api'
param deploymentIdentityName = 'nso-audit-dev-purview-deploy'
param githubRepository = 'kapblaubar/nso-audit'
param githubEnvironment = 'development'
