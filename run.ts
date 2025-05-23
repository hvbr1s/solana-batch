import { signWithApiSigner } from './signer';
import { Connection, PublicKey } from '@solana/web3.js';
import { createAndSignTx } from './process_tx'
import { createAlt, extendAlt, doBatch } from './helpers'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config()

const connection = new Connection('https://api.mainnet-beta.solana.com');

export interface FordefiSolanaConfig {
  accessToken: string;
  vaultId: string;
  fordefiSolanaVaultAddress: string;
  privateKeyPem: string;
  apiPathEndpoint: string;
};


export const fordefiConfig: FordefiSolanaConfig = {
  accessToken: process.env.FORDEFI_API_TOKEN || "",
  vaultId: process.env.VAULT_ID || "",
  fordefiSolanaVaultAddress: process.env.VAULT_ADDRESS || "",
  privateKeyPem: fs.readFileSync('./secret/private.pem', 'utf8'),
  apiPathEndpoint: '/api/v1/transactions/create-and-wait'
};


export const batchConfig = {
  fordefiVault: new PublicKey(fordefiConfig.fordefiSolanaVaultAddress),
  recipientsList: [
    new PublicKey("9BgxwZMyNzGUgp6hYXMyRKv3kSkyYZAMPGisqJgnXCFS"),
    new PublicKey("FEwZdEBick94iFJcuVQS2gZyqhSDunSs82FTZgk26RpD"),
    new PublicKey("GAPpdNzX3BnsHYJvRH2MiaTqKhDd7QFnwWskxtTLJsbf")
  ],
  amountPerRecipient: 1_000n,
  tableAddress: new PublicKey('Czt9hAHcWhLtcZc1CqHrJmidvX4ZnGiBALdgh9t7L5Kn'), // update 
  action: "create" // create, extend or batch
};

async function main(): Promise<void> {
  if (!fordefiConfig.accessToken) {
    console.error('Error: FORDEFI_API_TOKEN environment variable is not set');
    return;
  }

  // Prepare request body for tx payload
  let jsonBody;
  if (batchConfig.action === "create") {
    jsonBody = await createAlt(connection, batchConfig.fordefiVault, fordefiConfig);
  } else if (batchConfig.action === "extend") {
    jsonBody = await extendAlt(connection, batchConfig.fordefiVault, fordefiConfig, batchConfig.tableAddress, batchConfig.recipientsList);
  } else if (batchConfig.action === "batch") {
    jsonBody = await doBatch(connection, batchConfig.fordefiVault, fordefiConfig, batchConfig.tableAddress, batchConfig.recipientsList, batchConfig.amountPerRecipient);
  } else {
    console.error('Error: Invalid action specified');
    return;
  }
  console.log("JSON request: ", jsonBody)

  // Fetch serialized tx from json file
  const requestBody = JSON.stringify(jsonBody);

  // Finalize tx payload for API Signer
  const timestamp = new Date().getTime();
  const payload = `${fordefiConfig.apiPathEndpoint}|${timestamp}|${requestBody}`;

  try {
    // Send tx payload to API Signer for signature
    const signature = await signWithApiSigner(payload, fordefiConfig.privateKeyPem);
    
    // Send signed payload to Fordefi for MPC signature
    const response = await createAndSignTx(fordefiConfig.apiPathEndpoint, fordefiConfig.accessToken, signature, timestamp, requestBody);
    const data = response.data;
    console.log(data)
    console.log("Transaction submitted to Fordefi for broadcast ✅")
    console.log(`Transaction ID: ${data.id}`)

  } catch (error: any) {
    console.error(`Failed to sign the transaction: ${error.message}`);
  }
}

if (require.main === module) {
  main();
}