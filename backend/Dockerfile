FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=3001
EXPOSE 3001

# migrate.js registra cada migración aplicada en schema_migrations y se salta
# las que ya corrieron, así que es seguro ejecutarlo en cada arranque/deploy.
CMD ["sh", "-c", "node migrate.js && node server.js"]
