targetScope = 'resourceGroup'

@description('Globally unique lowercase storage account name.')
param storageAccountName string
@description('Function App name.')
param functionAppName string
@description('User-assigned identity name.')
param identityName string = '${functionAppName}-identity'
@description('GitHub repository owner, for OIDC subject binding.')
param githubOwner string = 'example'
@description('GitHub repository name, for OIDC subject binding.')
param githubRepo string = 'claim-check-handoff-ledger'
@description('GitHub branch or environment subject.')
param githubSubject string = 'repo:${githubOwner}/${githubRepo}:ref:refs/heads/main'
param location string = resourceGroup().location

var storageBlobContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
var storageQueueContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '974c5e8b-45b9-4653-ba55-5f855dd0fb88')

resource workspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${functionAppName}-logs'
  location: location
  properties: { retentionInDays: 30 }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${functionAppName}-insights'
  location: location
  kind: 'web'
  properties: { Application_Type: 'web', WorkspaceResourceId: workspace.id }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowSharedKeyAccess: false
    accessTier: 'Hot'
    publicNetworkAccess: 'Enabled'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: { isVersioningEnabled: true }
}

resource claimchecks 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'claimchecks'
  properties: { publicAccess: 'None' }
}
resource ledger 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'ledger'
  properties: { publicAccess: 'None' }
}
resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' = {
  parent: storage
  name: 'default'
}
resource handoffs 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = {
  parent: queueService
  name: 'handoffs'
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

resource federated 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: identity
  name: 'github-main'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: githubSubject
    audiences: [ 'api://AzureADTokenExchange' ]
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    httpsOnly: true
    serverFarmId: plan.id
    siteConfig: {
      linuxFxVersion: 'Node|20'
      appSettings: [
        { name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node' }
        { name: 'AzureWebJobsStorage__accountName'
          value: storage.name }
        { name: 'AzureWebJobsStorage__credential'
          value: 'managedidentity' }
        { name: 'AzureWebJobsStorage__clientId'
          value: identity.properties.clientId }
        { name: 'AZURE_STORAGE_ACCOUNT_URL'
          value: 'https://${storage.name}.blob.${environment().suffixes.storage}' }
        { name: 'AZURE_STORAGE_QUEUE_URL'
          value: 'https://${storage.name}.queue.${environment().suffixes.storage}/handoffs' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: insights.properties.ConnectionString }
      ]
    }
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${functionAppName}-plan'
  location: location
  kind: 'functionapp'
  sku: { name: 'Y1', tier: 'Dynamic' }
  properties: { reserved: true }
}

resource blobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, identity.id, storageBlobContributor)
  scope: storage
  properties: { roleDefinitionId: storageBlobContributor, principalId: identity.properties.principalId, principalType: 'ServicePrincipal' }
}
resource queueRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, identity.id, storageQueueContributor)
  scope: storage
  properties: { roleDefinitionId: storageQueueContributor, principalId: identity.properties.principalId, principalType: 'ServicePrincipal' }
}

output functionAppName string = functionApp.name
output storageAccountName string = storage.name
output identityClientId string = identity.properties.clientId
