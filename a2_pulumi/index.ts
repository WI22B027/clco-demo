import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as storage from "@pulumi/azure-native/storage";
import * as azure from "@pulumi/azure-native";

// Load Configuration from Pulumi.dev.yaml
const config = new pulumi.Config();
const skuName = config.require("skuName"); 
const kind = config.require("kind");
const location = config.require("location");
const storageAccountName = config.require("storageAccountName");

// Create an Azure Resource Group
const resourceGroup = new resources.ResourceGroup("A2_ResourceGroup", {
    location: location,
});

// Create an Azure resource (Storage Account)
const storageAccount = new storage.StorageAccount(storageAccountName, {
    resourceGroupName: resourceGroup.name,
    sku: {
        name: skuName as azure.storage.SkuName,
    },
    kind: kind as azure.storage.Kind,
});

// Enable static website support
const staticWebsite = new storage.StorageAccountStaticWebsite("staticWebsite", {
    accountName: storageAccount.name,
    resourceGroupName: resourceGroup.name,
    indexDocument: "index.html",
});

// Upload the file
const indexHtml = new storage.Blob("index.html", {
    resourceGroupName: resourceGroup.name,
    accountName: storageAccount.name,
    containerName: staticWebsite.containerName,
    source: new pulumi.asset.FileAsset("index.html"),
    contentType: "text/html",
});

// Export the primary key of the Storage Account
const storageAccountKeys = storage.listStorageAccountKeysOutput({
    resourceGroupName: resourceGroup.name,
    accountName: storageAccount.name
});

// Web endpoint to the website
export const staticEndpoint = storageAccount.primaryEndpoints.web;
