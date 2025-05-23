import { Connection, PublicKey, SystemProgram, AddressLookupTableProgram, TransactionMessage, VersionedTransaction, AddressLookupTableAccount } from '@solana/web3.js';
import { FordefiSolanaConfig } from './run';

function buildFordefiRequestBody(
  fordefiConfig: FordefiSolanaConfig,
  serializedMessage: string
) {
  return {
    "vault_id": fordefiConfig.vaultId,
    "signer_type": "api_signer",
    "sign_mode": "auto",
    "type": "solana_transaction",
    "details": {
      "fee": {
        "type": "priority",
        "priority_level": "medium"
      },
      "type": "solana_serialized_transaction_message",
      "push_mode": "auto",
      "data": serializedMessage,
      "chain": "solana_mainnet"
    },
    "wait_for_state": "signed"
  };
}

async function createAndSerializeTransaction(
  connection: Connection,
  payerKey: PublicKey,
  instructions: any[],
  lookupTables: AddressLookupTableAccount[] = []
): Promise<string> {
  const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  
  const messageV0 = new TransactionMessage({
    payerKey,
    recentBlockhash,
    instructions,
  }).compileToV0Message(lookupTables);
  
  const tx = new VersionedTransaction(messageV0);
  console.debug(tx);
  
  return Buffer.from(tx.message.serialize()).toString('base64');
}

export async function createAlt( 
  connection: Connection,
  fordefiVault: PublicKey,
  fordefiConfig: FordefiSolanaConfig
) {
  const recentSlot = await connection.getSlot();
  const [createIx, tableAddress] = AddressLookupTableProgram.createLookupTable({
    authority: fordefiVault,
    payer: fordefiVault,
    recentSlot
  });
  
  console.debug(`Your ALT will be created at https://solscan.io/account/${tableAddress}`);
  
  const serializedMessage = await createAndSerializeTransaction(
    connection,
    fordefiVault,
    [createIx]
  );
  
  return buildFordefiRequestBody(fordefiConfig, serializedMessage);
}

export async function extendAlt(
  connection: Connection,
  fordefiVault: PublicKey,
  fordefiConfig: FordefiSolanaConfig,
  tableAddress: PublicKey,
  recipients: PublicKey[]
) {
  const extendIx = AddressLookupTableProgram.extendLookupTable({
    payer: fordefiVault,
    authority: fordefiVault,
    lookupTable: tableAddress,
    addresses: recipients,
  });
  
  const serializedMessage = await createAndSerializeTransaction(
    connection,
    fordefiVault,
    [extendIx]
  );
  
  return buildFordefiRequestBody(fordefiConfig, serializedMessage);
}

export async function doBatch(
  connection: Connection,
  fordefiVault: PublicKey,
  fordefiConfig: FordefiSolanaConfig,
  tableAddress: PublicKey,
  recipients: PublicKey[],
  amountPerRecipient: bigint
) {
  const batchIxs = recipients.map(dest =>
    SystemProgram.transfer({
      fromPubkey: fordefiVault,
      toPubkey: dest,
      lamports: amountPerRecipient,
    })
  );
  
  const tableAccount = (await connection.getAddressLookupTable(tableAddress)).value!;
  
  const serializedMessage = await createAndSerializeTransaction(
    connection,
    fordefiVault,
    batchIxs,
    [tableAccount]
  );
  
  return buildFordefiRequestBody(fordefiConfig, serializedMessage);
}