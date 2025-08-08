FROM node:23.11.0-slim

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 8082

CMD ["npm", "run", "start"]