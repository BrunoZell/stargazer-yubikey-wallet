# GP

```cmd
gp -l
gp -d -a 00A4040006D27600012401 -a 0020008208<PIN in hex> -a 802A9E9A20<data in hex> -a 0088000000
gp -d -a 00A4040006D27600012401 -a 0020008208313233343536 -a 802A9E9A204a656c6c6f20576f726c6421aabbccddeeff00112233445566778899aabbccddeeff -a 0088000000
```

In this command:
00A4040006D27600012401: Select the OpenPGP application.
0020008208313233343536: Verify the PIN (replace 313233343536 with the hexadecimal representation of your PIN).
802A9E9A20<data_in_hex>: Prepare the data to be signed (replace <data_in_hex> with your data in hexadecimal).
0088000000: Perform the signing operation.


Prepared Transaction 9a3e86b1d05fc26070544cb87f91c4569c661e8fa2e35fa577d133a6350487da2534a2cd2b702ba4842c06cff96a57962f831375935ee1b5542ff39c0e79be59:
txHash as UTF-8 bytes in hex:

```hex
3961336538366231643035666332363037303534346362383766393163343536396336363165386661326533356661353737643133336136333530343837646132353334613263643262373032626134383432633036636666393661353739363266383331333735393335656531623535343266663339633065373962653539
```

Default pin in hex:

```
1E240
313233343536 (ascii hex)
```


secp256k1 OpenPGP sign key on YubiNanoC: `79825D85C8A09191DB3C53DC9B70B27E1322DFEE` long, short: `9B70B27E1322DFEE`