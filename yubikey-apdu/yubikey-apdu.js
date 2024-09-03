const pcsclite = require('pcsclite');
const fs = require('fs');
const http = require('http');
const BN = require("bn.js");

const { keyStore } = require('@stardust-collective/dag4-keystore');

// Verification
const EC = require("elliptic");
const { ECDSASignature } = require("elliptic");
const curve = new EC.ec("secp256k1");

async function loadSecp256k1() {
    return await import("@noble/secp256k1");
}



const logFile = fs.createWriteStream('./yubikey-apdu-logfile.txt', { flags: 'a' });

function log(message) {
    console.log(message);
    logFile.write(`${new Date().toISOString()} - ${message}\n`, () => {
        logFile.end();
    });
}

function resolveStatusWord(statusWord) {
    const statusMap = {
        '9000': 'Success',
        '6700': 'Wrong length',
        '6982': 'Security status not satisfied',
        '6983': 'Wrong PIN entered or Yubikey locked. Please check your PIN and your keys PIN retry counter.',
        '6985': 'Conditions of use not satisfied',
        '6A80': 'Incorrect parameters in data field',
        '6A81': 'Function not supported',
        '6A82': 'File not found',
        '6A83': 'Record not found',
        '6A84': 'Not enough memory space',
        '6A86': 'Incorrect parameters in P1-P2',
        '6B00': 'Wrong parameters P1-P2',
        '6D00': 'Instruction code not supported',
        '6E00': 'Class not supported',
        '6F00': 'Unknown error'
    };

    return statusMap[statusWord.toUpperCase()] || `Unexpected status word: ${statusWord}`;
}

async function transmitApdu(reader, apdu, protocol) {
    return new Promise((resolve, reject) => {
        const bufferSize = 1024; // Initial buffer size
        reader.transmit(apdu, bufferSize, protocol, function (err, data) {
            if (data) {
                log(`APDU Request Executed: ${apdu.toString('hex')} -> Response: ${data.toString('hex')}`);
            }

            if (err) {
                log(`Error transmitting APDU: ${err.message}`);
                reject(err);
            } else {
                const statusWord = data.slice(-2).toString('hex');
                const statusMessage = resolveStatusWord(statusWord);
                if (statusWord === '9000') {
                    resolve(data);
                } else if (statusWord.startsWith('61')) {
                    // 7.2.6, page 58: https://gnupg.org/ftp/specs/OpenPGP-smart-card-application-3.4.pdf
                    // 61xx means response must be read in multiple parts.
                    // Handle the case where more data is available
                    const remainingDataLength = parseInt(statusWord.slice(2), 16);
                    const getResponseApdu = Buffer.from('00C00000' + statusWord.slice(2), 'hex');
                    reader.transmit(getResponseApdu, remainingDataLength + 2, protocol, function (err, additionalData) {
                        if (err) {
                            log(`Error transmitting GET RESPONSE APDU: ${err.message}`);
                            reject(err);
                        } else {
                            resolve(Buffer.concat([data.slice(0, -2), additionalData]));
                        }
                    });
                } else {
                    reject(new Error(statusMessage));
                }
            }
        });
    });
}

// Function to process the raw public key response
function extractPublicKey(publicKeyResponse) {
    // Verify the response code
    const responseCode = publicKeyResponse.slice(0, 2).toString('hex');
    if (responseCode !== '7f49') {
        throw new Error(`Unexpected response code: ${responseCode}`);
    }

    // Read the first length (next hex char after the response code)
    const firstLengthHex = publicKeyResponse.slice(2, 3).toString('hex');
    const firstLength = parseInt(firstLengthHex, 16);

    // Verify the first two characters after the length are '86' for ECDSA
    const ecdsaIndicator = publicKeyResponse.slice(3, 4).toString('hex');
    if (ecdsaIndicator !== '86') {
        throw new Error(`Unexpected ECDSA indicator: ${ecdsaIndicator}`);
    }

    // Read the second length (next hex char after '86')
    const secondLengthHex = publicKeyResponse.slice(4, 5).toString('hex');
    const secondLength = parseInt(secondLengthHex, 16);

    // Extract the uncompressed public key based on the second length
    const uncompressedPublicKey = publicKeyResponse.slice(5, 5 + secondLength).toString('hex');

    return uncompressedPublicKey;
}

async function signDataWithYubikey(rawSha512Buffer, pin) {
    const pcsc = pcsclite();

    return new Promise((resolve, reject) => {
        pcsc.on('reader', function (reader) {
            log(`Reader detected: ${reader.name}`);

            reader.on('error', function (err) {
                log(`Error: ${err.message}`);
                reject(err);
            });

            reader.on('status', function (status) {
                log(`Status: ${JSON.stringify(status)}`);

                // Check if a card is present
                const changes = reader.state ^ status.state;
                if (changes & reader.SCARD_STATE_PRESENT && status.state & reader.SCARD_STATE_PRESENT) {
                    log('Card inserted');

                    reader.connect({ share_mode: reader.SCARD_SHARE_SHARED }, async function (err, protocol) {
                        if (err) {
                            log(`Error connecting to card: ${err.message}`);
                            reject(err);
                            return;
                        }

                        log(`Protocol: ${protocol}`);
                        const pgpApduCommand = '00A4040006D27600012401';
                        log(`PGP APDU Command: ${pgpApduCommand}`);

                        // Get the public key from the YubiKey
                        // Reference page 48: https://gnupg.org/ftp/specs/OpenPGP-smart-card-application-3.4.pdf
                        const getPublicKeyCLA = '00';
                        const getPublicKeyINS = '47'; // GENERATE ASYMMETRIC KEY PAIR
                        const getPublicKeyP1 = '81'; // Reading of actual public key
                        const getPublicKeyP2 = '00';
                        const getPublicKeyLc = '000002';
                        const getPublicKeyLe = 'B600'; // Signature key
                        const getPublicKeyEm = '0000';

                        const getPublicKeyApdu = getPublicKeyCLA + getPublicKeyINS + getPublicKeyP1 + getPublicKeyP2 + getPublicKeyLc + getPublicKeyLe + getPublicKeyEm;
                        log(`GET PUBLIC KEY APDU Command: ${getPublicKeyApdu}`);

                        // Serialize the PIN parameter
                        const pinHex = Buffer.from(pin, 'utf8').toString('hex');
                        const pinLengthHex = Buffer.from(pin, 'utf8').byteLength.toString(16).padStart(2, '0');

                        // Construct the PIN APDU command
                        const pinCLA = '00';
                        const pinINS = '20'; // (Instruction byte for VERIFY)
                        const pinP1 = '00'; // Parameter 1, usually 00 for VERIFY
                        const pinP2 = '81'; // reference control parameter: Must be 81 for SIGN as specified in 7.2.10
                        const pinLc = pinLengthHex;
                        const pinData = pinHex;

                        const pinApduCommand = pinCLA + pinINS + pinP1 + pinP2 + pinLc + pinData;
                        log(`PIN APDU Command: ${pinApduCommand}`);

                        // Ensure the input rawSha512Buffer is of the expected 64-byte length
                        if (rawSha512Buffer.length !== 64) {
                            reject(new Error('Invalid SHA-512 hash length. Expected 64 bytes.'));
                            return;
                        }

                        // Construct the signing APDU command
                        const CLA = '00';
                        const INS = '2A'; // PERFORM SECURITY OPERATION
                        const P1 = '9E'; // 9E specifies that the operation is to compute a digital signature
                        const P2 = '9A'; // 9A specifies that the data is a hash that needs to be signed
                        const Lc = '40'; // hex for 64, so 512 bits for a SHA512
                        const Data = rawSha512Buffer.toString('hex');
                        const Le = '00';

                        const signApduCommand = CLA + INS + P1 + P2 + Lc + Data + Le;
                        log(`SIGN APDU Command: ${signApduCommand}`);

                        try {
                            // Send the PGP APDU command
                            await transmitApdu(reader, Buffer.from(pgpApduCommand, 'hex'), protocol);

                            // Get the public key from the YubiKey
                            const publicKeyResponse = await transmitApdu(reader, Buffer.from(getPublicKeyApdu, 'hex'), protocol);
                            const publicKey = extractPublicKey(publicKeyResponse);
                            log(`Public Key: ${publicKey}`);

                            // Send the PIN APDU command
                            await transmitApdu(reader, Buffer.from(pinApduCommand, 'hex'), protocol);

                            // Send the signing APDU command
                            const signResponse = await transmitApdu(reader, Buffer.from(signApduCommand, 'hex'), protocol);

                            reader.disconnect(reader.SCARD_LEAVE_CARD, function (err) {
                                if (err) {
                                    log(`Error disconnecting from card: ${err.message}`);
                                    reject(err);
                                } else {
                                    log('Disconnected from card with final signature response: ' + signResponse.toString('hex'));

                                    // Extract the signature
                                    const signature = signResponse.slice(0, 64).toString('hex');
                                    resolve({ signature, publicKey });
                                }
                            });
                        } catch (err) {
                            reject(err);
                        }
                    });
                }
            });

            reader.on('end', function () {
                log('Reader removed');
            });
        });

        pcsc.on('error', function (err) {
            log(`PCSC error: ${err.message}`);
            reject(err);
        });
    });
}

// async function main() {
//     const secp = await loadSecp256k1();
//     const [, , utf8StringToSign, pin] = process.argv;

//     if (!utf8StringToSign || !pin) {
//         console.error('Usage: node yubikey-apdu.js <utf8-string> <pin>');
//         process.exit(1);
//     }

//     try {
//         const utf8BufferToSign = Buffer.from(utf8StringToSign, 'utf8');
//         const sha512HashHex = keyStore.sha512(utf8BufferToSign);
//         // const sha512Hash2 = crypto.createHash('sha256').update(utf8StringToSign).digest();
//         const rawSha512Buffer = Buffer.from(sha512HashHex, 'hex');

//         const { signature, publicKey } = await signDataWithYubikey(rawSha512Buffer, pin);

//         const signatureBuffer = Buffer.from(signature, 'hex')

//         // Verify signature is a 64 byte buffer
//         if (!Buffer.isBuffer(signatureBuffer) || signatureBuffer.length !== 64) {
//             throw new Error('Invalid signature format. Expected a 64 byte buffer.');
//         }

//         // Split the signature into r and s
//         const r = new BN(signatureBuffer.slice(0, 32), 16, 'be');
//         const s = new BN(signatureBuffer.slice(32, 64), 16, 'be');

//         // Encode r and s into DER format
//         const derSignatureBn = { r, s };

//         const derSignatureBigint = {
//             r: BigInt(r.toString(10)),
//             s: BigInt(s.toString(10))
//         };

//         // Encode r and s into ASN.1 DER format
//         const derSignatureAsn = Buffer.concat([
//             Buffer.from([0x30]), // SEQUENCE tag
//             Buffer.from([0x44]), // Length of the sequence (0x44 = 68 bytes)
//             Buffer.from([0x02]), // INTEGER tag
//             Buffer.from([0x20]), // Length of r (0x20 = 32 bytes)
//             r.toArrayLike(Buffer, 'be', 32), // r value
//             Buffer.from([0x02]), // INTEGER tag
//             Buffer.from([0x20]), // Length of s (0x20 = 32 bytes)
//             s.toArrayLike(Buffer, 'be', 32)  // s value
//         ]).toString('hex');

//         console.log(derSignatureBn);
//         console.log(derSignatureBigint);
//         console.log(`ASN.1 DER Encoded Signature: ${derSignatureAsn}`);


//         let valid1, valid2, valid3;
//         try {
//             valid2 = secp.verify(derSignatureBigint, sha512HashHex, Buffer.from(publicKey, 'hex'), { lowS: false });
//             valid3 = secp.verify(signature, sha512HashHex, Buffer.from(publicKey, 'hex'), { lowS: false });
//         } catch (error) {
//             console.error(JSON.stringify({ error: error.message }));
//         }

//         try {
//             // Import public key
//             var key = curve.keyFromPublic(publicKey, 'hex');

//             // Verify signature
//             valid1 = key.verify(sha512HashHex, derSignatureBn);
//         } catch (error) {
//             console.error(JSON.stringify({ error: error.message }));
//         }

//         console.log(JSON.stringify({
//             input: utf8BufferToSign.toString('hex'),
//             digest: sha512HashHex.toString('hex'),
//             rawSignature: signature,
//             asnDerSignature: derSignatureAsn,
//             publicKey,
//             valid1,
//             valid2,
//             valid3
//         }, null, 2));
//     } catch (error) {
//         console.error(JSON.stringify({ error: error.message }));
//     }
//     process.exit(0); // Terminate the process after successful response
// }

// main().catch(error => {
//     log(`Unhandled error: ${error.message}`);
//     process.exit(1);
// });


const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/sign') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            console.log(`Request received: ${body}`); // Log the request body
            try {
                const { hash, pin } = JSON.parse(body);
                const rawSha512Buffer = Buffer.from(hash, 'hex');
                const { signature, publicKey } = await signDataWithYubikey(rawSha512Buffer, pin);

                const signatureBuffer = Buffer.from(signature, 'hex')

                // Verify signature is a 64 byte buffer
                if (!Buffer.isBuffer(signatureBuffer) || signatureBuffer.length !== 64) {
                    throw new Error('Invalid signature format. Expected a 64 byte buffer.');
                }
        
                // Split the signature into r and s
                const r = new BN(signatureBuffer.slice(0, 32), 16, 'be');
                const s = new BN(signatureBuffer.slice(32, 64), 16, 'be');

                // Encode r and s into ASN.1 DER format
                const derSignatureAsn = Buffer.concat([
                    Buffer.from([0x30]), // SEQUENCE tag
                    Buffer.from([0x44]), // Length of the sequence (0x44 = 68 bytes)
                    Buffer.from([0x02]), // INTEGER tag
                    Buffer.from([0x20]), // Length of r (0x20 = 32 bytes)
                    r.toArrayLike(Buffer, 'be', 32), // r value
                    Buffer.from([0x02]), // INTEGER tag
                    Buffer.from([0x20]), // Length of s (0x20 = 32 bytes)
                    s.toArrayLike(Buffer, 'be', 32)  // s value
                ]).toString('hex');

                const response = JSON.stringify({
                    publicKey: publicKey,
                    digestSigned: hash,
                    signatureRaw: signature,
                    signatureAsnDer: derSignatureAsn
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(response);
                console.log(`Response sent: ${response}`); // Log the response
            } catch (error) {
                const errorResponse = JSON.stringify({ error: error.message });
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(errorResponse);
                console.log(`Error response sent: ${errorResponse}`); // Log the error response
            }
        });
    } else {
        const notFoundResponse = JSON.stringify({ error: 'Not Found' });
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(notFoundResponse);
        console.log(`Not Found response sent: ${notFoundResponse}`); // Log the 404 response
    }
});

server.listen(3333, () => {
    log('Server is listening on port 3333');
});