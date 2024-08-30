const { execSync } = require('child_process');
const fs = require('fs');

const logFile = fs.createWriteStream('./yubikey-bridge-logfile.txt', { flags: 'a' });

function log(message) {
    logFile.write(`${new Date().toISOString()} - ${message}\n`, () => {
        logFile.end();
    });
}

function readMessage() {
    return new Promise((resolve, reject) => {
        let rawLength = Buffer.alloc(4); // Buffer to store the length of the message
        let messageBuffer = null;
        let messageLength = 0;
        let receivedLength = 0;

        function onData(chunk) {
            if (messageBuffer === null) {
                // Case: Message length is not yet known
                // Accumulate the first 4 bytes to determine message length
                log(`Received raw length chunk: ${chunk.toString('hex')}`);
                chunk.copy(rawLength, receivedLength); // Copy chunk into rawLength starting at receivedLength
                receivedLength += chunk.length;

                if (receivedLength >= 4) {
                    // Once 4 bytes are received, read the message length
                    messageLength = rawLength.readUInt32LE(0);
                    log(`Parsed message length: ${messageLength}`);
                    messageBuffer = Buffer.alloc(messageLength);

                    // Handle remaining data in the chunk
                    const remainingChunk = chunk.slice(4);
                    remainingChunk.copy(messageBuffer, 0); // Copy remaining chunk into messageBuffer
                    receivedLength = remainingChunk.length;
                }
            } else {
                // Case: Message length is known but not all data has been received yet
                // Accumulate chunks into messageBuffer
                log(`Received message chunk: ${chunk.toString('hex')}`);
                // This calculates how many more bytes are needed to complete the message.
                // Math.min ensures that we only copy the smaller of the two values, either the remaining bytes needed to complete the message or the length of the current chunk.
                const bytesToCopy = Math.min(messageLength - receivedLength, chunk.length);
                chunk.copy(messageBuffer, receivedLength, 0, bytesToCopy);
                receivedLength += bytesToCopy;
                // The remaining bytes are the bytes that were not needed to complete the message and are
                // just discarded as this implementation expects only one request message per execution.
            }

            // Check if the entire message has been received
            if (receivedLength >= messageLength) {
                // Case: Message length is known and all data has been received
                const message = messageBuffer.toString();
                log(`Parsed message: ${message}`);
                process.stdin.removeListener('data', onData);
                resolve(JSON.parse(message));
            }
        }

        process.stdin.on('data', onData);

        // Add a timeout to detect if the process is hanging
        setTimeout(() => {
            process.stdin.removeListener('data', onData);
            reject(new Error('Timeout waiting for message'));
        }, 5000); // 5 seconds timeout
    });
}

function sendMessage(message) {
    const jsonMessage = JSON.stringify(message);
    const messageLength = Buffer.byteLength(jsonMessage);
    const buffer = Buffer.alloc(4 + messageLength);
    buffer.writeUInt32LE(messageLength, 0);
    buffer.write(jsonMessage, 4);

    log(`Sending message: ${jsonMessage}`);
    try {
        process.stdout.write(buffer);
        log(`Successfully sent message: ${jsonMessage}`);
    } catch (error) {
        log(`Failed to send message: ${error.message}`);
    }
}

async function handleMessage() {
    try {
        const message = await readMessage();
        if (message.command === 'getPublicKey') {
            log(`Processing getPublicKey message`);
            try {
                const statusStdout = execSync('gpg --card-status', { encoding: 'utf8' });
                log(`gpg output received:\n${statusStdout}`);

                const { fingerprint, serialNumber, hasNoSignatureKey, keyAttributes } = parseFingerprint_fromGpgCardStatusOutput(statusStdout);

                if (hasNoSignatureKey || !fingerprint) {
                    sendMessage({
                        error: `No signature key on Yubikey with serial number ${serialNumber}.`,
                        serial: serialNumber
                    });
                    return;
                }

                if (keyAttributes.sign.toLowerCase() !== "secp256k1") {
                    sendMessage({
                        error: `Signature key is not of type secp256k1 on Yubikey with serial number ${serialNumber}.`,
                        serial: serialNumber,
                        type: keyAttributes.sign
                    });
                    return;
                }

                // Run the gpg --export --armor command to get the public key in ASCII-armored format
                const publicKeyArmor = execSync('gpg --export --armor ' + fingerprint, { encoding: 'utf8' });

                log(`gpg key export:\n${publicKeyArmor}`);

                const publicKeyPackets = execSync('gpg --list-packets --verbose', {
                    input: publicKeyArmor,
                    encoding: 'utf8'
                });

                log(`gpg key packets:\n${publicKeyPackets}`);

                const publicKeyHex = parsePublicKey_fromGpgListPublicKetPacketsVerboseOutput(publicKeyPackets);

                sendMessage({
                    fingerprint: fingerprint,
                    publicKey: publicKeyHex,
                    serial: serialNumber,
                    type: keyAttributes.sign
                });
            } catch (error) {
                log(`gpg error: ${error.message}`);
                sendMessage({ error: error.message });
            }
        } else if (message.command === 'signHash') {
            log(`Processing signHash message`);
            const { publicKey, fingerprint, hash } = message;
            try {
                log(`Signing hash ${hash} with fingerprint ${fingerprint} and public key ${publicKey}`);

                // Interpret hex string as UTF8 string and put it as bytes
                const hashBuffer = Buffer.from(hash, 'utf8');

                // Sign the binary data
                const signedArmor = execSync('gpg --digest-algo SHA512 --sign --armor --default-key ' + fingerprint, {
                    input: hashBuffer
                }).toString('utf8');
                log(`gpg signed armor output:\n${signedArmor}`);

                const signaturePackets = execSync('gpg --list-packets --verbose', {
                    input: signedArmor,
                    encoding: 'utf8'
                });

                log(`gpg signature packets:\n${signaturePackets}`);

                const rawSignature = parseSignature_fromGpgListSignaturePacketsVerboseOutput(signaturePackets);

                sendMessage({ signature: rawSignature });
            } catch (error) {
                log(`gpg error: ${error.message}`);
                sendMessage({ error: error.message });
            }
        } else {
            sendMessage({ error: 'Unknown command' });
        }
    } catch (error) {
        sendMessage({ error: error.message });
        log(`Error handling message: ${error.message}`);
    }
}

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
        log(`Raw signature extracted: ${rawSignature} from packet match:\n${match[0]}`);
        return rawSignature;
    } else {
        throw new Error("Signature packet not found.");
    }
}

async function main() {
    await handleMessage();
}

main().catch(error => {
    log(`Unhandled error: ${error.message}`);
    process.exit(1);
});