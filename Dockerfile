FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Instalar TODAS as dependências (incluindo dev) para o build
RUN npm install

COPY . .

# Fazer o build
RUN npm run build

# Remover devDependencies após o build
RUN npm prune --production

EXPOSE 3000

CMD ["node", "dist/main.js"]