# Puppeteer's official image ships a matching Chrome + all system deps.
FROM ghcr.io/puppeteer/puppeteer:22.12.0

# The base image runs as the non-root "pptruser".
WORKDIR /home/pptruser/app

COPY --chown=pptruser:pptruser package.json ./
# Chrome is already in the image; skip Puppeteer's own download.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
RUN npm install --omit=dev

COPY --chown=pptruser:pptruser . .

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
