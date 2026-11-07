import secrets

SEED_BITS = 63
SEED_MAX = (1 << SEED_BITS) - 1


def generate_seed() -> int:
    return secrets.randbits(SEED_BITS)
