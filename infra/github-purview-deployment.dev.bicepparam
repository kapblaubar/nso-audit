using './github-api-deployment.bicep'

param location = 'westus2'
param environmentName = 'dev'
param functionAppName = 'nso-audit-dev-pur-api'
param deploymentIdentityName = 'nso-audit-dev-purview-deploy'
param githubRepository = 'kapblaubar/nso-audit'
param githubEnvironment = 'development'
param githubSubject = 'repo:kapblaubar@95560298/nso-audit@1333451275:environment:development'
