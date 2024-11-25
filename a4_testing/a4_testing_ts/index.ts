import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as storage from "@pulumi/azure-native/storage";
import * as azure from "@pulumi/azure-native";

// Function to generate a SAS URL for a blob
function signedBlobReadUrl(args: {
    blobUrl: pulumi.Output<string>;
    accountName: pulumi.Output<string>;
    resourceGroupName: pulumi.Output<string>;
    containerName: pulumi.Output<string>;
    blobName: pulumi.Output<string>;
}): pulumi.Output<string> {
    const { blobUrl, accountName, resourceGroupName, containerName, blobName } = args;

    const sas = pulumi.all([accountName, resourceGroupName, containerName, blobName]).apply(
        ([accName, rgName, contName, blobName]) => {
            return storage.listStorageAccountServiceSASOutput({
                accountName: accName,
                protocols: storage.HttpProtocol.Https,
                sharedAccessStartTime: "2021-01-01",
                sharedAccessExpiryTime: "2030-01-01",
                resource: storage.SignedResource.B,
                resourceGroupName: rgName,
                permissions: storage.Permissions.R,
                canonicalizedResource: `/blob/${accName}/${contName}/${blobName}`,
            });
        }
    );

    return pulumi
        .all([blobUrl, sas.apply((s) => s.serviceSasToken)])
        .apply(([blobUrl, sasToken]) => `${blobUrl}?${sasToken}`);
}

// Create an Azure Resource Group
const resourceGroup = new resources.ResourceGroup("a4_resourceGroup");

// Create a Storage Account
const storageAccount = new storage.StorageAccount("a4sa", {
    resourceGroupName: resourceGroup.name,
    sku: {
        name: storage.SkuName.Standard_LRS,
    },
    kind: storage.Kind.StorageV2,
});

// Create a Blob Container
const container = new storage.BlobContainer("a4container", {
    accountName: storageAccount.name,
    resourceGroupName: resourceGroup.name,
});

// Upload the index.html file as a zip
const blob = new storage.Blob("index.zip", {
    resourceGroupName: resourceGroup.name,
    accountName: storageAccount.name,
    containerName: container.name,
    source: new pulumi.asset.AssetArchive({
        "index.html": new pulumi.asset.FileAsset("./index.html"),
    }),
    contentType: "application/zip",
});

// Generate the base blob URL
const blobUrl = pulumi.interpolate`https://${storageAccount.name}.blob.core.windows.net/${container.name}/${blob.name}`;

// Generate the SAS URL
const sasUrl = signedBlobReadUrl({
    blobUrl,
    accountName: storageAccount.name,
    resourceGroupName: resourceGroup.name,
    containerName: container.name,
    blobName: blob.name,
});

// Create an App Service Plan
const appServicePlan = new azure.web.AppServicePlan("a4appServicePlan", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
        tier: "Free",
        name: "F1",
    },
    kind: "Linux",
    reserved: true,
});

// Create a Web App
const webApp = new azure.web.WebApp("a4webapp", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    serverFarmId: appServicePlan.id,
    siteConfig: {
        appSettings: [
            {
                name: "WEBSITE_RUN_FROM_PACKAGE", // Tells Azure App Service to treat the package (ZIP file) as the root of your application
                value: sasUrl, // Use the SAS URL here
            },
        ],
        linuxFxVersion: "PHP|8.3", // Runtime for PHP
    },
});

// Export the Web App URL and the SAS URL
export const webAppUrlOutput = pulumi.interpolate`https://${webApp.defaultHostName}`;
export const blobSasUrlOutput = sasUrl;
export const resourceGroupOutput = resourceGroup;
export const storageAccountOutput = storageAccount;
export const containerOutput = container;
export const blobOutput = blob;
export const appServicePlanOutput = appServicePlan;
export const webAppOutput = webApp;
export const blobSasUrlOutput = blobSasUrl;
export const webAppUrlOutput = webAppUrl;
