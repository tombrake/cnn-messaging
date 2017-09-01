FROM node:8.4.0

# Build environment variables
ENV APP_PATH=/home/app
ENV APP=$APP_PATH/cnn-messaging

# Set up non root user to run install and build
RUN useradd --user-group --create-home --shell /bin/false app

# Set up folder and add install files
RUN mkdir -p $APP
COPY package.json $APP

# Any kind of copying from the host must be down as root so this sets
# the permissions for the app user to be able to read the files
RUN chown -R app:app $APP_PATH/*

USER app
WORKDIR $APP

# Install app dependencies
RUN npm install

# Copy the app source files
USER root
COPY . $APP
RUN chown -R app:app $APP_PATH/*

CMD [ "npm", "run", "loadtest" ]
