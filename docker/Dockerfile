FROM node:8-alpine

ENV NODE_ENV=production

RUN mkdir /app
WORKDIR /app

COPY package.json .

RUN npm install --production

COPY moleculer.config.js ./
COPY services ./

CMD ["npm", "start"]