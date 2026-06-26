-- ============================================================================
-- 00_uuidv7.sql — Portable, monotonic UUIDv7 generator (PostgreSQL 16/17)
-- ----------------------------------------------------------------------------
-- PG18 ships native uuidv7(); on 16/17 this provides an equivalent so every
-- table's DEFAULT works across versions. Drop this function on PG18.
--
-- RFC 9562 UUIDv7 layout (16 bytes):
--   bytes 0-5 : 48-bit big-endian Unix ms timestamp
--   byte  6   : version nibble (0111) + 4 bits  \ we fill these 12 "rand_a"
--   byte  7   : 8 bits                          / bits with sub-ms fraction
--   byte  8   : variant (10) + 6 random bits
--   bytes 9-15: 56 random bits
--
-- Monotonicity (RFC 9562 method 3): the 12 rand_a bits hold the fractional
-- part of the current millisecond (0..4095), so UUIDs minted in the same ms
-- still sort in generation order -> tight B-tree index locality under bursts.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid AS $$
DECLARE
  epoch_s   double precision := extract(epoch FROM clock_timestamp());
  unix_ms   bigint := floor(epoch_s * 1000)::bigint;
  -- sub-millisecond fraction scaled into 12 bits (0..4095)
  sub_frac  int    := floor((epoch_s * 1000 - floor(epoch_s * 1000)) * 4096)::int;
  rand      bytea  := gen_random_bytes(8);   -- byte7 unused here; bytes for 8..15
  ts_bytes  bytea;
  b6 int; b7 int; b8 int;
BEGIN
  ts_bytes := substring(int8send(unix_ms) FROM 3 FOR 6);     -- 48-bit timestamp

  -- byte 6: version 7 (high nibble) + high 4 bits of sub_frac
  b6 := 112 | ((sub_frac >> 8) & 15);                        -- 0x70 | top nibble of frac
  -- byte 7: low 8 bits of sub_frac
  b7 := sub_frac & 255;
  -- byte 8: variant '10' + 6 random bits
  b8 := 128 | (get_byte(rand, 0) & 63);                      -- 0x80 | rand

  RETURN encode(
      ts_bytes
   || set_byte('\x00'::bytea, 0, b6)
   || set_byte('\x00'::bytea, 0, b7)
   || set_byte('\x00'::bytea, 0, b8)
   || substring(rand FROM 2 FOR 7),                          -- bytes 9..15 random
    'hex')::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;
