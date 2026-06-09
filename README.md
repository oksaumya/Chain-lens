# Chain Lens

**Chain Lens** turns raw Bitcoin transactions and blocks into precise, machine-checkable JSON — and explains them to anyone through a friendly web visualizer.

It ships as two things built on one shared parsing/accounting core:

1. **A CLI analyzer** that emits a detailed, schema-stable JSON report for a transaction or a whole block.
2. **A web visualizer** that takes the same analysis and renders it as plain-English diagrams, annotations, and value-flow graphics for non-technical users.

Chain Lens focuses on **parsing, accounting, and classification** of the Bitcoin transaction format — not signature validation or script execution. It works entirely offline against local fixtures and Bitcoin Core's raw data files; no node or external API required.

---

## Features

- **Full transaction parsing** — legacy and SegWit, with `txid` / `wtxid`, version, locktime, sizes, weight, and vbytes per BIP141.
- **Fee accounting** — matches prevouts to inputs by `(txid, vout)`, computes total in/out, fee, and fee rate.
- **Script classification** — recognizes P2PKH, P2SH, P2WPKH, P2WSH, P2TR (key/script path), nested SegWit, and OP_RETURN, with mainnet address derivation.
- **Script disassembly** — human-readable ASM for scriptPubKeys, scriptSigs, and witnessScripts.
- **OP_RETURN decoding** — handles all push opcodes, UTF-8 decoding, and known-protocol detection (Omni, OpenTimestamps).
- **Timelock & RBF analysis** — absolute locktime typing, BIP68 relative timelocks per input, and BIP125 replaceability signaling.
- **SegWit discount visualization** — actual weight vs. hypothetical legacy weight and the resulting savings.
- **Block-mode parsing** — reads Bitcoin Core `blk*.dat` / `rev*.dat` files (XOR-deobfuscated), recovers prevouts from undo data, verifies the merkle root, and decodes BIP34 height.
- **Warnings** — dust outputs, high fees, unknown scripts, and RBF signaling.

---

## Getting started

```bash
./setup.sh          # install dependencies and build
```

### Analyze a transaction

```bash
./cli.sh fixtures/transactions/tx_legacy_p2pkh.json
```

This reads the fixture, writes the JSON report to `out/<txid>.json`, and prints it to stdout. Exit code is `0` on success, `1` on error (invalid fixture, malformed tx, inconsistent prevouts, etc.).

### Analyze a block

```bash
./cli.sh --block <blk*.dat> <rev*.dat> <xor.dat>
```

A single `blk*.dat` may contain multiple blocks; Chain Lens parses and reports each one to `out/<block_hash>.json`.

### Launch the web visualizer

```bash
./web.sh            # honors PORT (default 3000); prints the URL and runs until stopped
```

Open the printed URL (e.g. `http://127.0.0.1:3000`) to load a fixture, paste a `raw_tx` + prevouts, or upload block files for analysis. A health endpoint is available at `GET /api/health` → `200 { "ok": true }`.

---

## Fixture input format

Transaction-mode fixture:

```json
{
  "network": "mainnet",
  "raw_tx": "0200000001...",
  "prevouts": [
    {
      "txid": "11...aa",
      "vout": 0,
      "value_sats": 123456,
      "script_pubkey_hex": "0014..."
    }
  ]
}
```

- `raw_tx` is hex-encoded transaction bytes (no `0x` prefix).
- `prevouts` provides the spent outputs so fees can be computed. They are matched to inputs by `(txid, vout)` and need not be ordered the same as the inputs. A missing, duplicated, or unmatched prevout is an error.

Block mode uses Bitcoin Core's raw data files directly instead of a fixture JSON:

- `blk*.dat` — block data (may hold multiple blocks).
- `rev*.dat` — undo data carrying prevout value + scriptPubKey for every spent input.
- `xor.dat` — the XOR key Core uses to obfuscate the `.dat` files (all-zero key means no transformation).

---

## Output format

### Transaction report

```json
{
  "ok": true,
  "network": "mainnet",
  "segwit": true,
  "txid": "...",
  "wtxid": "...",
  "version": 2,
  "locktime": 800000,
  "size_bytes": 222,
  "weight": 561,
  "vbytes": 141,
  "total_input_sats": 123456,
  "total_output_sats": 120000,
  "fee_sats": 3456,
  "fee_rate_sat_vb": 24.51,
  "rbf_signaling": true,
  "locktime_type": "block_height",
  "locktime_value": 800000,
  "segwit_savings": {
    "witness_bytes": 107,
    "non_witness_bytes": 115,
    "total_bytes": 222,
    "weight_actual": 561,
    "weight_if_legacy": 888,
    "savings_pct": 36.82
  },
  "vin": [
    {
      "txid": "...",
      "vout": 0,
      "sequence": 4194311,
      "script_sig_hex": "...",
      "script_asm": "...",
      "witness": ["..."],
      "script_type": "p2wpkh",
      "address": "bc1...",
      "prevout": { "value_sats": 123456, "script_pubkey_hex": "..." },
      "relative_timelock": { "enabled": true, "type": "blocks", "value": 7 }
    }
  ],
  "vout": [
    {
      "n": 0,
      "value_sats": 120000,
      "script_pubkey_hex": "...",
      "script_asm": "OP_0 OP_PUSHBYTES_20 89abcdef0123456789abcdef0123456789abcdef",
      "script_type": "p2wpkh",
      "address": "bc1..."
    },
    {
      "n": 1,
      "value_sats": 0,
      "script_pubkey_hex": "6a08736f622d32303236",
      "script_asm": "OP_RETURN OP_PUSHBYTES_8 736f622d32303236",
      "script_type": "op_return",
      "address": null,
      "op_return_data_hex": "736f622d32303236",
      "op_return_data_utf8": "sob-2026",
      "op_return_protocol": "unknown"
    }
  ],
  "warnings": [{ "code": "RBF_SIGNALING" }]
}
```

Key field rules:

- `wtxid` and `segwit_savings` are `null` for non-SegWit transactions.
- `address` is set for recognized script types (on both inputs and outputs), else `null`.
- `witness` is `[]` per input for legacy txs; for SegWit it carries the exact stack items in order (including empty items as `""`).
- `fee_rate_sat_vb` is a JSON number; small rounding differences (±0.01) are tolerated.

### Block report

```json
{
  "ok": true,
  "mode": "block",
  "block_header": {
    "version": 536870912,
    "prev_block_hash": "...",
    "merkle_root": "...",
    "merkle_root_valid": true,
    "timestamp": 1710000000,
    "bits": "...",
    "nonce": 12345,
    "block_hash": "..."
  },
  "tx_count": 150,
  "coinbase": {
    "bip34_height": 800000,
    "coinbase_script_hex": "...",
    "total_output_sats": 631250000
  },
  "transactions": ["/* same format as single-tx analysis, one per tx */"],
  "block_stats": {
    "total_fees_sats": 6250000,
    "total_weight": 3996000,
    "avg_fee_rate_sat_vb": 25.1,
    "script_type_summary": {
      "p2wpkh": 420, "p2tr": 180, "p2sh": 55,
      "p2pkh": 30, "p2wsh": 12, "op_return": 8, "unknown": 2
    }
  }
}
```

In block mode, Chain Lens parses the 80-byte header and all transactions, recovers prevouts from the undo file, recomputes and verifies the merkle root, identifies the coinbase, and decodes its BIP34 height. Reports are written to files only (not stdout).

### Errors

```json
{ "ok": false, "error": { "code": "INVALID_TX", "message": "..." } }
```

Failures return structured JSON with a non-empty `error.code` and `error.message`, and exit code `1`.

---

## Script classification reference

**Outputs:** `p2pkh`, `p2sh`, `p2wpkh`, `p2wsh`, `p2tr`, `op_return`, `unknown`.

**Inputs:** `p2pkh`, `p2sh-p2wpkh`, `p2sh-p2wsh`, `p2wpkh`, `p2wsh`, `p2tr_keypath`, `p2tr_scriptpath`, `unknown`.

For recognized types, `address` is the corresponding mainnet address. OP_RETURN outputs add `op_return_data_hex`, `op_return_data_utf8` (or `null` if not valid UTF-8), and `op_return_protocol` (`omni`, `opentimestamps`, or `unknown`).

**Disassembly** uses space-separated tokens: standard opcode names (`OP_DUP`, `OP_HASH160`, …), `OP_PUSHBYTES_<n> <hex>` for direct pushes, `OP_PUSHDATA1/2/4 <hex>` for extended pushes, `OP_0` and `OP_1`..`OP_16` for small ints, and `OP_UNKNOWN_<0xNN>` for undefined opcodes. Empty scripts render as `""`. Witness items are raw data and not disassembled, except that P2WSH / P2SH-P2WSH inputs add `witness_script_asm` for the trailing witnessScript.

---

## Warnings

| Code | Condition |
|------|-----------|
| `HIGH_FEE` | `fee_sats > 1_000_000` or `fee_rate_sat_vb > 200` |
| `DUST_OUTPUT` | a non-`op_return` output has `value_sats < 546` |
| `UNKNOWN_OUTPUT_SCRIPT` | any output classified `unknown` |
| `RBF_SIGNALING` | the transaction signals BIP125 replaceability |

---

## Project layout

```
src/         core analyzer, parser, and shared lib (TypeScript)
frontend/    web visualizer (Vite)
fixtures/    sample transactions and block data
grader/      reference checks and expected outputs
cli.sh       transaction / block analyzer entrypoint
web.sh       web visualizer launcher
setup.sh     install + build
```

---

## License

Released for educational and research use. Built on public Bitcoin specifications (BIP141, BIP68, BIP125, BIP34) and Bitcoin Core's data formats.
