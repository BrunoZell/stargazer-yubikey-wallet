const { dag4 } = require('@stardust-collective/dag4');
const { keyStore } = require('@stardust-collective/dag4-keystore');
const { TransactionReference } = require('@stardust-collective/dag4-network');
const { readFileSync } = require('fs');
const openpgp = require('openpgp');
const { execSync } = require('child_process');

function log(message) {
    console.log(message);
}

const amount = 1; // 1 DAG
const fee = 0.1; // Transaction fee
const fromAddress = 'DAG53VFwtir9K3WfeCLU7EVsmhJGYZtwf9YJJE1J';
const toAddress = 'DAG4o8VYNg34Mnxp9mT4zDDCZTvrHWniscr3aAYv';
const lastRef = {
    hash: "0000000000000000000000000000000000000000000000000000000000000000",
    ordinal: 0,
};

const { tx, hash: txHash } = keyStore.prepareTx(amount, toAddress, fromAddress, lastRef, fee, '2.0');

console.log(`Prepared Transaction ${txHash}:`);
console.log(tx);


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
    const { fingerprint, serialNumber, hasNoSignatureKey, keyAttributes } = parseFingerprint_fromGpgCardStatusOutput(cardStatus);

    if (hasNoSignatureKey || !fingerprint) throw new Error(`No signature key on Yubikey with serial number ${serialNumber}.`);
    if (keyAttributes.sign.toLowerCase() !== "secp256k1") throw new Error(`Signature key is not of type secp256k1 on Yubikey with serial number ${serialNumber}.`);

    const publicKeyArmor = execSync(`gpg --export --armor ${fingerprint}`).toString('utf8');
    const publicKeyPackets = execSync('gpg --list-packets --verbose', { input: publicKeyArmor, encoding: 'utf8' });
    const publicKeyHex = parsePublicKey_fromGpgListPublicKetPacketsVerboseOutput(publicKeyPackets);

    return publicKeyHex;
}

// Sign transaction with software key
async function signTransactionWithSoftwareKey(filePath, txHash) {
    const privateKeyHex = await loadPrivateKeyFromFile(filePath);
    const signature = await keyStore.sign(privateKeyHex, txHash);
    return signature;
}

// Sign transaction on Yubikey
async function signTransactionOnYubikey(fingerprint, txHash) {
    const txHashBuffer = Buffer.from(txHash, "hex");
    const sha512Hash = keyStore.sha512(txHash);
    const rawGpgSignDigest = txHashBuffer;
    // const rawGpgSignDigest = txHash;
    const signedArmor = execSync(`gpg --digest-algo SHA512 --sign --armor --default-key ${fingerprint} --binary`, { input: txHashBuffer }).toString('utf8');
    const signaturePackets = execSync('gpg --list-packets --verbose', { input: signedArmor, encoding: 'utf8' });
    const rawSignature = parseSignature_fromGpgListSignaturePacketsVerboseOutput(signaturePackets);

    return rawSignature;
}

async function signAndVerify(loadPublicKey, signTransaction) {
    const publicKeyHex = await loadPublicKey();
    console.log(`Loaded Public Key: ${publicKeyHex}`);

    const address = keyStore.getDagAddressFromPublicKey(publicKeyHex);
    console.log(`Inferred Address: ${address}`);
    console.log(`Matches Provided Address? ${address === fromAddress}`);

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

async function main() {
    await signAndVerify(
        loadPublicKeyFromAsc.bind(null, 'private_key.asc'),
        signTransactionWithSoftwareKey.bind(null, 'private_key.asc')
    )

    console.log('\n\n----------------------------------------\n\n');

    await signAndVerify(
        loadPublicKeyFromYubikey.bind(null),
        signTransactionOnYubikey.bind(null, "9B70B27E1322DFEE")
    )
}

main().catch(console.error);

// -------------------------------------------------------------------------------------------------

function parseFingerprint_fromGpgCardStatusOutput(gpgOutput) {
    const signatureKeyFingerprintRegex = /Signature key\s*\.*:\s+([0-9A-F\s]+)(?=\r?\n)/;
    const signatureKeyNoneRegex = /Signature key\s*\.*:\s+\[none\]/;
    const serialNumberRegex = /Serial number\s*\.*:\s+(\d+)/;
    const keyAttributesRegex = /Key attributes\s*\.*:\s+([a-z0-9\s]+)(?=\r?\n)/i;

    const signatureKeyFingerprintMatch = gpgOutput.match(signatureKeyFingerprintRegex);
    const serialNumberMatch = gpgOutput.match(serialNumberRegex);
    const keyAttributesMatch = gpgOutput.match(keyAttributesRegex);

    const signatureKeyFingerprint = signatureKeyFingerprintMatch ? signatureKeyFingerprintMatch[1].replace(/\s+/g, '') : null;
    const serialNumber = serialNumberMatch ? serialNumberMatch[1] : null;
    const hasNoSignatureKey = signatureKeyNoneRegex.test(gpgOutput);

    if (serialNumber) {
        log(`Serial number ${serialNumber} extracted from: "${serialNumberMatch[0]}"`);
    } else {
        log(`No serial number found`);
    }

    if (signatureKeyFingerprint) {
        log(`Key fingerprint ${signatureKeyFingerprint} extracted from: "${signatureKeyFingerprintMatch[0]}"`);
    } else {
        log(`No signature key fingerprint found`);
    }

    log(`Has [none] signature key: ${hasNoSignatureKey}`);

    let keyAttributes = { sign: null, encrypt: null, authenticate: null };
    if (keyAttributesMatch) {
        const attributes = keyAttributesMatch[1].trim().split(/\s+/);
        if (attributes.length === 3) {
            keyAttributes = {
                sign: attributes[0],
                encrypt: attributes[1],
                authenticate: attributes[2]
            };
            log(`Key attributes extracted: sign=${keyAttributes.sign}, encrypt=${keyAttributes.encrypt}, authenticate=${keyAttributes.authenticate}`);
        } else {
            log(`Could not extract key attributes from: ${keyAttributesMatch[0]}`);
        }
    } else {
        log(`No key attributes found`);
    }

    return { fingerprint: signatureKeyFingerprint, serialNumber, hasNoSignatureKey, keyAttributes };
}

function parsePublicKey_fromGpgListPublicKetPacketsVerboseOutput(gpgOutput) {
    // Regular expression to match the public key packet and extract pkey[1]
    const publicKeyPacketRegex = /:public key packet:\r?\n\s+version \d+, algo \d+, created \d+, expires \d+\r?\n\s+pkey\[0\]: [0-9A-F]+ .+\r?\n\s+pkey\[1\]: ([0-9A-F]+)\r?\n\s+keyid: [0-9A-F]+/;
    const match = gpgOutput.match(publicKeyPacketRegex);

    if (match) {
        const publicKeyHex = match[1];
        log(`Public key ${publicKeyHex} extrated from packet match:\n${match[0]}`);
        return publicKeyHex;
    } else {
        throw new Error("Public key packet not found.");
    }
}

function parseSignature_fromGpgListSignaturePacketsVerboseOutput(gpgOutput) {
    const signaturePacketRegex = /:signature packet:.*?data: ([0-9A-F]+).*?data: ([0-9A-F]+)/s;
    const match = gpgOutput.match(signaturePacketRegex);

    if (match) {
        const rawSignature = match[1] + match[2];
        log(`Raw signature extracted: ${rawSignature}`);
        return rawSignature;
    } else {
        throw new Error("Signature packet not found.");
    }
}
