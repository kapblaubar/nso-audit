using './sql.bicep'

param environmentName = 'dev'
param sqlServerName = 'nso-audit-dev-257f10d8'
param databaseName = 'nso-audit-dev'
param administratorLogin = 'chris@newsommer.com'
param administratorObjectId = '28995be7-732b-47c4-a04d-f4ea51eb088e'
param administratorType = 'User'
param allowedIpv4Addresses = [
  '52.149.26.131'
  '52.250.80.223'
  '52.250.81.131'
  '52.156.92.168'
  '52.156.94.32'
  '52.156.94.33'
  '40.64.128.231'
  // Observed Linux Consumption worker egress; not included in ARM outboundIpAddresses.
  '20.3.32.210'
  '172.194.168.132'
  '52.175.252.145'
  '40.91.85.183'
  '4.246.2.62'
  '4.246.2.36'
  '52.175.252.238'
  '172.179.80.209'
]
// Deployment wrapper supplies the current operator IP and exact Function outbound addresses.
// All values are public configuration, not credentials.
