import * as pulumi from "@pulumi/pulumi";
import * as azure from"@pulumi/azure-native";
import * as storage from "@pulumi/azure-native/storage";
import * as fs from "fs";
import * as path from "path";

// Function to recursively map files for consistent paths
function getAssetMap(dir: string): pulumi.asset.AssetMap {
    const assets: pulumi.asset.AssetMap = {};

    function walk(directory: string, basePath: string) {
        fs.readdirSync(directory).forEach(file => {
            const filePath = path.join(directory, file);
            const relativePath = path.relative(basePath, filePath).replace(/\\/g, "/"); // Replace backslashes with forward slashes
            if (fs.statSync(filePath).isDirectory()) {
                walk(filePath, basePath);
            } else {
                assets[relativePath] = new pulumi.asset.FileAsset(filePath);
            }
        });
    }

    walk(dir, dir);
    return assets;
}

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

//Config
const config = new pulumi.Config();
const location = "uksouth"
const resourceGroupName = "a3-python-webapp-rg";

//Resource Group
const resourceGroup = new azure.resources.ResourceGroup("a3resourcegroup",{
    location: location,
    resourceGroupName: resourceGroupName,
});

//Storage Account
const storageAccount = new azure.storage.StorageAccount("a3storageaccount",{
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
        name: azure.storage.SkuName.Standard_LRS,
    },
    kind: azure.storage.Kind.StorageV2,
    //allowBlobPublicAccess: true,
});

//Blob Container
const container = new azure.storage.BlobContainer("a3container",{
    accountName: storageAccount.name,
    resourceGroupName: resourceGroup.name,
    //publicAccess: azure.storage.PublicAccess.Blob,
});

const webAppAssets = getAssetMap("./webApp");
//Packaging the WebApp
const archive = new pulumi.asset.AssetArchive(webAppAssets);

//Upload the package
const blob = new azure.storage.Blob("webAppBlob.zip",{
    resourceGroupName: resourceGroup.name,
    accountName: storageAccount.name,
    containerName: container.name,
    type: azure.storage.BlobType.Block,
    source: archive,
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

//Create App Service Plan
const appServicePlan = new azure.web.AppServicePlan("a3appServicePlan",{
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
        tier: "Free",
        name: "F1",
    },
    kind: "linux",
    reserved: true,
});

//Create the web app
const webApp = new azure.web.WebApp("a3webapp",{
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    serverFarmId: appServicePlan.id,
    httpsOnly: true,
    clientAffinityEnabled: false,
    siteConfig: {
        appSettings: [
            {
                name: "WEBSITE_RUN_FROM_PACKAGE", //tells Azure App Service to treat the package (ZIP file) as the root of your application and run it without unpacking
                value: sasUrl,
            },
            {
                name: "FLASK_ENV", //forces dependency installation
                value: "development",
            },
            {
                name: "FLASK_DEBUG", //forces dependency installation
                value: "1",
            },
            {
                name: "FLASK_APP", //forces dependency installation
                value: "app.py",
            },
        ],
        linuxFxVersion: "Python|3.9", //Defines the Runtime Stack
        appCommandLine: "pip install -r /home/site/wwwroot/requirements.txt && FLASK_APP=app.py python -m flask run --host=0.0.0.0 --port=8000",
    },
});

export const webAppUrl = pulumi.interpolate`https://${webApp.defaultHostName}`;
export const storageAccountName = storageAccount.name;
export const containerName = container.name;
export const blobUrlOutput = blobUrl;
export const blobSasUrl = sasUrl;