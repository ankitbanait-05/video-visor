"""Read and write Electron .asar archives (the format Video Visor's code ships in).

Only the Python standard library is used, so no Node.js install is needed.

Archive layout:
    uint32 4 | uint32 header_size | uint32 payload_size | uint32 json_len | header JSON (padded to 4) | file data
Each file entry carries SHA-256 integrity data. Electron checks the hash of the header JSON against
ElectronAsarIntegrity in Info.plist, so the build script writes that hash after packing.
"""
import hashlib
import json
import os
import struct

BLOCK_SIZE = 4 * 1024 * 1024


def read_header(archive):
    with open(archive, "rb") as f:
        _, header_size, _, json_len = struct.unpack("<IIII", f.read(16))
        raw = f.read(json_len)
    return json.loads(raw), raw, 8 + header_size


def header_hash(archive):
    """SHA-256 of the header JSON: the value Electron expects in Info.plist."""
    return hashlib.sha256(read_header(archive)[1]).hexdigest()


def extract(archive, out_dir, unpacked_dir=None, skip_top=()):
    """Extract every file. Unpacked files are copied from `unpacked_dir` (app.asar.unpacked).
    Returns the relative paths of the files that were marked unpacked."""
    header, _, base = read_header(archive)
    unpacked = []
    with open(archive, "rb") as f:
        def walk(node, rel):
            for name, entry in node["files"].items():
                if name in ("", ".", "..") or "/" in name or "\\" in name:
                    raise ValueError("Unsafe path in archive: %r" % name)
                path = os.path.join(rel, name) if rel else name
                if not rel and name in skip_top:
                    continue
                dest = os.path.join(out_dir, path)
                if "files" in entry:
                    os.makedirs(dest, exist_ok=True)
                    walk(entry, path)
                    continue
                if "link" in entry:
                    raise ValueError("Symbolic links are not supported: " + path)
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                if entry.get("unpacked"):
                    unpacked.append(path)
                    if unpacked_dir is None:
                        continue
                    with open(os.path.join(unpacked_dir, path), "rb") as src, open(dest, "wb") as out:
                        out.write(src.read())
                else:
                    f.seek(base + int(entry["offset"]))
                    with open(dest, "wb") as out:
                        out.write(f.read(entry["size"]))
                if entry.get("executable") or (unpacked_dir and os.access(os.path.join(unpacked_dir, path), os.X_OK)):
                    os.chmod(dest, 0o755)
        walk(header, "")
    return unpacked


def _integrity(path):
    blocks, whole = [], hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(BLOCK_SIZE)
            if not chunk:
                break
            whole.update(chunk)
            blocks.append(hashlib.sha256(chunk).hexdigest())
    if not blocks:
        blocks = [hashlib.sha256(b"").hexdigest()]
    return {"algorithm": "SHA256", "hash": whole.hexdigest(), "blockSize": BLOCK_SIZE, "blocks": blocks}


def pack(src_dir, archive, is_unpacked=lambda rel: False):
    """Pack `src_dir` into `archive`. Files for which is_unpacked(rel) is true go to
    `<archive>.unpacked/` instead (binaries the app runs directly, such as ffmpeg).
    Returns the SHA-256 of the header JSON for Info.plist."""
    unpacked_root = archive + ".unpacked"
    data_files, offset = [], 0

    def walk(directory, rel):
        nonlocal offset
        node = {"files": {}}
        for name in sorted(os.listdir(directory)):
            if name == ".DS_Store":
                continue
            full = os.path.join(directory, name)
            path = rel + "/" + name if rel else name
            if os.path.islink(full):
                raise ValueError("Symbolic links are not supported: " + path)
            if os.path.isdir(full):
                child = walk(full, path)
                if child["files"]:
                    node["files"][name] = child
                continue
            size = os.path.getsize(full)
            entry = {"size": size, "integrity": _integrity(full)}
            if os.access(full, os.X_OK):
                entry["executable"] = True
            if is_unpacked(path):
                entry["unpacked"] = True
                dest = os.path.join(unpacked_root, path)
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with open(full, "rb") as s, open(dest, "wb") as d:
                    d.write(s.read())
                if entry.get("executable"):
                    os.chmod(dest, 0o755)
            else:
                entry["offset"] = str(offset)
                offset += size
                data_files.append(full)
            node["files"][name] = entry
        return node

    header = walk(src_dir, "")
    raw = json.dumps(header, separators=(",", ":")).encode()
    padded = len(raw) + (-len(raw)) % 4
    payload_size = 4 + padded
    with open(archive, "wb") as out:
        out.write(struct.pack("<IIII", 4, payload_size + 4, payload_size, len(raw)))
        out.write(raw + b"\0" * (padded - len(raw)))
        for path in data_files:
            with open(path, "rb") as f:
                while True:
                    chunk = f.read(BLOCK_SIZE)
                    if not chunk:
                        break
                    out.write(chunk)
    return hashlib.sha256(raw).hexdigest()
