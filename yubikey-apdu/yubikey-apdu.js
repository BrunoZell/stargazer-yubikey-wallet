const pcsclite = require('pcsclite');
const pcsc = pcsclite();
const crypto = require('crypto');

// Parameterize the PIN
const pin = '123456';
const pinHex = Buffer.from(pin, 'utf8').toString('hex');
const pinLengthHex = (pin.length).toString(16).padStart(2, '0');

// Prepare data for signing
const data = 'Hello';
const hash = crypto.createHash('sha512').update(data).digest('hex');
console.log('SHA-512 Digest:', hash);

// Verify PIN APDU Command Format
// CLA: 00 (Class byte)
// INS: 20 (Instruction byte for VERIFY)
// P1: 00 (Parameter 1, usually 00 for VERIFY)
// P2: 81 (Parameter 2, reference control parameter for PIN)
// 06: Length of the data field (length of the PIN in bytes, which is 6 in this case of 123456)
// Data: The PIN in hexadecimal format

// Prepare data for signing
// CLA: 00
// INS: 2A (PERFORM SECURITY OPERATION)
// P1: 9E (This indicates the type of security operation. For the PERFORM SECURITY OPERATION command, 9E specifies that the operation is to compute a digital signature.)
// P2: 9A | 80 (9A specifies that the data is a hash that needs to be signed; 80 means arbitrary data to be signed)
// Lc: 80 (length of the data in bytes, 128 in decimal)
// Data: 4a 65 6c 6c 6f 20 57 6f 72 6c 64 21 aa bb cc dd ee ff 00 11 22 33 44 55 66 77 88 99 aa bb cc dd ee ff

// Construct the PIN APDU command
const pinCLA = '00';
const pinINS = '20'; // (Instruction byte for VERIFY
const pinP1 = '00'; // Parameter 1, usually 00 for VERIFY
const pinP2 = '81'; // reference control parameter: Must be 81 for SIGN as specified in 7.2.10
const pinLc = pinLengthHex;
const pinData = pinHex;

const pinApduCommand = pinCLA + pinINS + pinP1 + pinP2 + pinLc + pinData;
console.log('PIN APDU Command:', pinApduCommand);

// Construct the signing APDU command
// Reference 7.2.10, page 63 on: https://gnupg.org/ftp/specs/OpenPGP-smart-card-application-3.4.pdf
const CLA = '00';
const INS = '2A'; // PERFORM SECURITY OPERATION
const P1 = '9E'; // 9E specifies that the operation is to compute a digital signature
const P2 = '9A'; // 9A specifies that the data is a hash that needs to be signed
const Lc = '40'; // hex for 64, so 512 bits for a SHA512
const Data = hash;
const Le = '00';

const apduCommand = CLA + INS + P1 + P2 + Lc + Data + Le;
console.log('APDU Command:', apduCommand);


const apduCommands = [
    Buffer.from('00A4040006D27600012401', 'hex'),  // Select the OpenPGP application
    Buffer.from(pinApduCommand, 'hex'),  // Verify the PIN
    Buffer.from(apduCommand, 'hex'),  // Perform signing
];

pcsc.on('reader', function(reader) {
    console.log('Reader detected:', reader.name);

    reader.on('error', function(err) {
        console.error('Error:', err.message);
    });

    reader.on('status', function(status) {
        console.log('Status:', status);

        // Check if a card is present
        const changes = reader.state ^ status.state;
        if (changes & reader.SCARD_STATE_PRESENT && status.state & reader.SCARD_STATE_PRESENT) {
            console.log('Card inserted');

            reader.connect({ share_mode: reader.SCARD_SHARE_SHARED }, function(err, protocol) {
                if (err) {
                    console.error('Error connecting to card:', err.message);
                    return;
                }

                console.log('Protocol:', protocol);

                // Send APDU commands sequentially
                (async function sendCommands() {
                    for (const apdu of apduCommands) {
                        await new Promise((resolve, reject) => {
                            reader.transmit(apdu, 256, protocol, function(err, data) {
                                if (err) {
                                    console.error('Error transmitting APDU:', err.message);
                                    reject(err);
                                } else {
                                    console.log('APDU:', apdu.toString('hex'), '-> Response:', data.toString('hex'));
                                    resolve(data);
                                }
                            });
                        });
                    }

                    reader.disconnect(reader.SCARD_LEAVE_CARD, function(err) {
                        if (err) {
                            console.error('Error disconnecting from card:', err.message);
                        } else {
                            console.log('Disconnected from card');
                        }
                    });
                })();
            });
        }
    });

    reader.on('end', function() {
        console.log('Reader removed');
    });
});

pcsc.on('error', function(err) {
    console.error('PCSC error:', err.message);
});