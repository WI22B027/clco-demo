// Import the resources from the Pulumi script
import * as infra from "../index";
import * as pulumi from "@pulumi/pulumi";
import * as assert from "assert";

// Set up Pulumi Mocks
pulumi.runtime.setMocks({
    newResource: (args) => {
        if (args.type === "azure:web/appServicePlan:AppServicePlan") {
            return {
                id: "mock-appServicePlan-id",
                state: {
                    resourceGroupName: "mock-resource-group",
                    location: "West Europe",
                    sku: {
                        tier: "Free",
                        name: "F1",
                    },
                    kind: "Linux",
                    reserved: true,
                },
            };
        }
        return { id: `${args.type}-id`, state: args.inputs };
    },
    call: (args) => {
        return {};
    },
});

describe("Unit Test - Infrastructure", () => {
    test("Resource Group is created", async () => {
        await infra.outputResourceGroup.apply(rg => {
            expect(rg).toBeDefined();
            expect(rg.name).toEqual("a4_resourceGroup");
        });
    });

    test("Storage Account is created with correct properties", async () => {
        await infra.outputStorageAccount.apply(sa => {
            expect(sa).toBeDefined();
            expect(sa.kind).toEqual("StorageV2");
            expect(sa.sku.name).toEqual("Standard_LRS");
        });
    });
});
