FROM node:22-slim

# python3/pip provide the interpreter for python/run_batch.py (parses the xlsx,
# renders the PDFs via Pillow). make/g++ are needed because better-sqlite3 has
# no prebuilt binary for this image and node-gyp compiles it from source.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY python/requirements.txt ./python/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r python/requirements.txt

COPY . .

ENV NODE_ENV=production

CMD ["node", "server.js"]
