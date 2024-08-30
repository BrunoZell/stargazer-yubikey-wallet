const { dag4 } = require('@stardust-collective/dag4');
const { keyStore } = require('@stardust-collective/dag4-keystore');
const { TransactionReference } = require('@stardust-collective/dag4-network');
const { readFileSync } = require('fs');
const openpgp = require('openpgp');
const { execSync } = require('child_process');

// Load private key from private_key.asc file
async function loadPrivateKeyFromFile(filePath) {
    const armoredKey = readFileSync(filePath, 'utf8');
    const result = await openpgp.readPrivateKey({ armoredKey });
    const keyID = result.getKeyID();
    const key = result.getKeys(keyID)[0];
    const keyBytes = key.keyPacket.privateParams.d;
    const privateKeyHex = Buffer.from(keyBytes).toString('hex');
    return privateKeyHex;
}

// Load public key from private_key.asc file
async function loadPublicKeyFromAsc(filePath) {
    const privateKeyHex = await loadPrivateKeyFromFile(filePath);
    const publicKeyHex = keyStore.getPublicKeyFromPrivate(privateKeyHex);
    return publicKeyHex;
}

// Load public key from Yubikey via gpg card status
async function loadPublicKeyFromYubikey() {
    const cardStatus = execSync('gpg --card-status').toString();
    const fingerprintMatch = cardStatus.match(/Key fingerprint = ([0-9A-F ]+)/);
    if (!fingerprintMatch) throw new Error('Fingerprint not found');
    const fingerprint = fingerprintMatch[1].replace(/\s/g, '');

    const publicKey = execSync(`gpg --export ${fingerprint}`).toString('hex');
    return { publicKeyHex: publicKey, fingerprint };
}

// Sign transaction with software key
async function signTransactionWithSoftwareKey(filePath, txHash) {
    const privateKeyHex = await loadPrivateKeyFromFile(filePath);
    const signature = await keyStore.sign(privateKeyHex, txHash);
    return signature;
}

// Sign transaction on Yubikey
async function signTransactionOnYubikey(fingerprint, txHash) {
    const signCommand = `echo ${txHash} | gpg --sign --armor --default-key ${fingerprint}`;
    const signedData = execSync(signCommand).toString();
    const signatureMatch = signedData.match(/-----BEGIN PGP SIGNATURE-----(.*?)-----END PGP SIGNATURE-----/s);
    if (!signatureMatch) throw new Error('Signature not found');
    const signature = signatureMatch[1].replace(/\s/g, '');
    return signature;
}

async function main(loadPublicKey, signTransaction) {
    const publicKeyHex = await loadPublicKey();
    console.log(`Loaded Public Key: ${publicKeyHex}`);

    const address = keyStore.getDagAddressFromPublicKey(publicKeyHex);
    console.log(`Address: ${address}`);

    const amount = 1; // 1 DAG
    const fee = 0.1; // Transaction fee
    const fromAddress = address;
    const toAddress = 'DAG4o8VYNg34Mnxp9mT4zDDCZTvrHWniscr3aAYv';

    const lastRef = {
        hash: "0000000000000000000000000000000000000000000000000000000000000000",
        ordinal: 0,
    };

    const { tx, hash: txHash } = keyStore.prepareTx(amount, toAddress, fromAddress, lastRef, fee, '2.0');

    console.log(`Prepared Transaction ${txHash}:`);
    console.log(tx);

    const signature = await signTransaction(txHash);
    console.log(`Signature: ${signature}`);

    const uncompressedPublicKey = publicKeyHex.length === 128 ? '04' + publicKeyHex : publicKeyHex;
    const success = keyStore.verify(uncompressedPublicKey, txHash, signature);

    if (!success) {
        throw new Error('Sign-Verify failed');
    } else {
        console.log('Sign-Verify succeeded');
    }
}

// Example usage
main(
    loadPublicKeyFromAsc.bind(null, 'private_key.asc'),
    signTransactionWithSoftwareKey.bind(null, 'private_key.asc')
).catch(console.error);

// main(loadPublicKeyFromYubikey, signTransactionOnYubikey).catch(console.error);

main(
    loadPublicKeyFromYubikey.bind(null),
    signTransactionOnYubikey.bind(null, "9B70B27E1322DFEE")
).catch(console.error);
