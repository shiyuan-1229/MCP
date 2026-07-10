import socket, json, time

host = "localhost"
port = 3457

# Step 1: SSE with socket (read only available data)
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(5)
sock.connect((host, port))

req = (f"GET /sse HTTP/1.1\r\n"
       f"Host: {host}:{port}\r\n"
       f"Authorization: Bearer demo-key-2026\r\n"
       f"Connection: keep-alive\r\n"
       f"\r\n")
sock.sendall(req.encode())

# Read headers
data = b""
while b"\r\n\r\n" not in data:
    chunk = sock.recv(4096)
    data += chunk

# Extract body after headers
headers, body = data.split(b"\r\n\r\n", 1)
body_text = body.decode()

# Parse sessionId from SSE body
session_path = body_text.split("data: ")[1].split("\n")[0].strip()
print(f"1. OK SSE session: {session_path}")

# Step 2: initialize
sock2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock2.settimeout(5)
sock2.connect((host, port))

init_body = json.dumps({
    "jsonrpc": "2.0", "id": 1, "method": "initialize",
    "params": {"protocolVersion": "2024-11-05", "capabilities": {},
               "clientInfo": {"name": "test", "version": "1.0"}}
})
req2 = (f"POST {session_path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        f"Authorization: Bearer demo-key-2026\r\n"
        f"Content-Type: application/json\r\n"
        f"Content-Length: {len(init_body)}\r\n"
        f"Connection: close\r\n"
        f"\r\n{init_body}")
sock2.sendall(req2.encode())

data2 = b""
while True:
    try:
        chunk = sock2.recv(4096)
        if not chunk:
            break
        data2 += chunk
    except socket.timeout:
        break

h2, resp_body = data2.split(b"\r\n\r\n", 1)
init_result = json.loads(resp_body.decode())
print(f"2. OK initialize: protocol={init_result.get('result',{}).get('protocolVersion','?')}")

# Step 3: tools/list
sock3 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock3.settimeout(5)
sock3.connect((host, port))

tools_body = json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
req3 = (f"POST {session_path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        f"Authorization: Bearer demo-key-2026\r\n"
        f"Content-Type: application/json\r\n"
        f"Content-Length: {len(tools_body)}\r\n"
        f"Connection: close\r\n"
        f"\r\n{tools_body}")
sock3.sendall(req3.encode())

data3 = b""
while True:
    try:
        chunk = sock3.recv(4096)
        if not chunk:
            break
        data3 += chunk
    except socket.timeout:
        break

h3, resp_body3 = data3.split(b"\r\n\r\n", 1)
tools_result = json.loads(resp_body3.decode())
tools = tools_result.get("result", {}).get("tools", [])
print(f"3. OK tools/list: {len(tools)} tools")
for t in tools:
    print(f"   OK {t['name']}")

sock.close()
sock2.close()
sock3.close()
