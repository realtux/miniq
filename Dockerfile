FROM node:22

WORKDIR /app

COPY package.json .
RUN npm i

COPY data ./data
COPY lib ./lib

EXPOSE 8282

CMD ["node", "lib/index.js"]
