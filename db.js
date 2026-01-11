const { MongoClient, ServerApiVersion } = require('mongodb');

let client = null; // store a client to a database

async function connect(uri, dbname) {
    // singleton pattern
    // we want to ensure that the client is created only once
    if (client) {
        return client;
    }
    // if the client is null, create one now
    client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1
        }
    });

    // connect to the cluster using the client
    await client.connect();    
    
    console.log("successfully connected to mongo")
    // return a connection to the database
    return client.db(dbname);
}

//export functions to make it available for other JS files
module.exports = {
    connect
}