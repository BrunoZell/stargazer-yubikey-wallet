const { dag4 } = require('@stardust-collective/dag4');
const { keyStore } = require('@stardust-collective/dag4-keystore');
const { TransactionReference } = require('@stardust-collective/dag4-network');
const { execSync } = require('child_process');

async function main() {
    // Generate a new private key
    const privateKey = keyStore.generatePrivateKey();
    console.log(`Private Key: ${privateKey}`);

    // Generate the corresponding public key and address
    const publicKey = keyStore.getPublicKeyFromPrivate(privateKey);
    const address = keyStore.getDagAddressFromPublicKey(publicKey);
    console.log(`Public Key: ${publicKey}`);
    console.log(`Address: ${address}`);

    // Create a test transaction
    const amount = 1; // 1 DAG
    const fee = 0.1; // Transaction fee
    const fromAddress = address;
    const toAddress = 'DAG4o8VYNg34Mnxp9mT4zDDCZTvrHWniscr3aAYv';

    // const lastRef = await dag4.network.getAddressLastAcceptedTransactionRef(fromAddress);
    const lastRef /*: TransactionReference*/ = {
        hash: "0000000000000000000000000000000000000000000000000000000000000000",   
        ordinal: 0,
    };

    const { tx, hash: txHash } = keyStore.prepareTx(amount, toAddress, fromAddress, lastRef, fee, '2.0');

    console.log(`Prepared Transaction ${txHash}:`);
    console.log(tx);

    // Sign on Yubikey
    // const signature = await this.signHashOnYubikey(fromPublicKey, gpgFingerprint, txHash);
    const softwareSignature = await keyStore.sign(privateKey, txHash);

    console.log(`Software Signature: ${softwareSignature}`);

    const uncompressedPublicKey = publicKey.length === 128 ? '04' + publicKey : publicKey;

    const success = keyStore.verify(uncompressedPublicKey, txHash, softwareSignature);

    if (!success) {
        throw new Error('Sign-Verify failed');
    } else {
        console.log('Sign-Verify succeeded');
    }
}

main().catch(console.error);
