const pcsclite = require('pcsclite');
const pcsc = pcsclite();

// Verify PIN APDU Command Format
// CLA: 00 (Class byte)
// INS: 20 (Instruction byte for VERIFY)
// P1: 00 (Parameter 1, usually 00 for VERIFY)
// P2: 82 (Parameter 2, reference control parameter for PIN)
// 06: Length of the data field (length of the PIN in bytes, which is 6 in this case of 123456)
// Data: The PIN in hexadecimal format

// Prepare data for signing
// CLA: 80
// INS: 2A (PERFORM SECURITY OPERATION)
// P1: 9E (This indicates the type of security operation. For the PERFORM SECURITY OPERATION command, 9E specifies that the operation is to compute a digital signature.)
// P2: 9A | 80 (9A specifies that the data is a hash that needs to be signed; 80 means arbitrary data to be signed)
// Lc: 80 (length of the data in bytes, 128 in decimal)
// Data: 4a 65 6c 6c 6f 20 57 6f 72 6c 64 21 aa bb cc dd ee ff 00 11 22 33 44 55 66 77 88 99 aa bb cc dd ee ff

const apduCommands = [
    Buffer.from('00A4040006D27600012401', 'hex'),  // Select the OpenPGP application
    Buffer.from('0020008206313233343536', 'hex'),  // Verify the PIN (replace with your PIN in hex)
    //Buffer.from('802A9E80803961336538366231643035666332363037303534346362383766393163343536396336363165386661326533356661353737643133336136333530343837646132353334613263643262373032626134383432633036636666393661353739363266383331333735393335656531623535343266663339633065373962653539', 'hex'),  // Prepare data for signing
    Buffer.from('802A9E800101', 'hex'),  // Prepare data for signing 1 byte: 01
    Buffer.from('0088000000', 'hex')  // Perform the signing operation
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