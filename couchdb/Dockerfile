FROM couchdb:3

# Copy LiveSync-compatible CouchDB config
COPY local.ini /opt/couchdb/etc/local.ini

# Copy init script
COPY init.sh /docker-entrypoint-initdb.d/init.sh
RUN chmod +x /docker-entrypoint-initdb.d/init.sh
