FROM node:18-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --silent --no-audit --no-fund || npm cache clean --force

COPY . .

CMD ["npm", "start"]
