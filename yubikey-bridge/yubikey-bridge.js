const { execSync } = require('child_process');
const fs = require('fs');
const util = require('util');

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
                const stdout = execSync('gpg --card-status', { encoding: 'utf8' });
                log(`gpg output received:\n${stdout}`);
                
                const { fingerprint, serialNumber, hasNoSignatureKey, keyAttributes } = parseGpgStatusOutput(stdout);

                if (hasNoSignatureKey || !fingerprint) {
                    sendMessage({
                        error: `No signature key on Yubikey with serial number ${serialNumber}`,
                        serial: serialNumber
                    });
                } else {
                    sendMessage({
                        fingerprint: fingerprint,
                        serial: serialNumber,
                        keyAttributes: {
                            sign: keyAttributes.sign,
                            encrypt: keyAttributes.encrypt,
                            authenticate: keyAttributes.authenticate
                        }
                    });
                }
            } catch (error) {
                log(`gpg error: ${error.message}`);
                sendMessage({ error: error.message });
            }
        } else if (message.command === 'signMessage') {
            log(`Processing signMessage message`);
            const { hexString } = message;
            try {
                const stdout = execSync(`echo ${hexString} | gpg --sign --armor`, { encoding: 'utf8' });
                log(`gpg output received:\n${stdout}`);
                
                sendMessage({ signature: null });
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

function parseGpgStatusOutput(gpgOutput) {
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
        log(`Public key ${signatureKeyFingerprint} extracted from: "${signatureKeyFingerprintMatch[0]}"`);
    } else {
        log(`No public key found`);
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

async function main() {
    await handleMessage();
}

main().catch(error => {
    log(`Unhandled error: ${error.message}`);
    process.exit(1);
});