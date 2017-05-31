var https = require('https');

module.exports = function(RED) {
    function ThingSpeak42Node(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        var creationPending = false;

        node.option = config.dropdown;

        // Options for new channel
        node.name = config.name
        node.description = config.description
        node.public = config.public

        node.newFieldNames = [
          config.field1,
          config.field2,
          config.field3,
          config.field4,
          config.field5,
          config.field6,
          config.field7,
          config.field8,
        ]

        node.meta = config.meta
        node.tags = config.tags
        node.url = config.url

        node.lat = config.lat
        node.long = config.long
        node.elevation = config.elevation

        // Options for appending to existing channel
        node.delay = config.delay;
        node.topics = [
            config.topic1,
            config.topic2,
            config.topic3,
            config.topic4,
            config.topic5,
            config.topic6,
            config.topic7,
            config.topic8
            ];

        node.endpoint = config.endpoint;

        node.timeout = null;

        clearStoredValues();

        function clearStoredValues() {
            node.values = [ null, null, null, null, null, null, null, null ];
            node.status({fill:"green",shape:"dot",text:"ready"});
        };

        function storeValue(index, value) {
            node.log("Storing value for field " + (i+1));
            node.values[index] = value;
            node.status({fill:"yellow",shape:"ring",text:"data queued, waiting..."});
        };

        function getValue(index) {
            return node.values[i];
        }

        function startTimer() {
            if( node.timeout == null ) {
                node.log("Starting " + node.delay + " second timer");
                var delayMs = 1000 * node.delay;
                node.timeout = setTimeout(publishData, delayMs);
            }
        }

        function stopTimer() {
            if( node.timeout != null ) {
                clearTimeout(node.timeout);
                node.timeout = null;
            }
        }

        function createChannel() {
          if (creationPending)
            return Promise.reject("duplicate request") 

          if (!node.credentials.accKey) {
            node.status({fill:"red",shape:"dot",text:"No account API key"});
            return Promise.reject("no key")
          }

          creationPending = true;
          node.status({fill:"blue",shape:"dot",text:"Creating channel..."});

          const options = {
            port: 443,
            hostname: "api.thingspeak.com",
            path: "/channels.json",
            method: "POST"
          }

          const req = https.request(options, (res) => {
            if (res.statusCode !== 200)
              return Promise.reject("status code", res.statusCode)

            let body = ""
            res.on("data", chunk => body += chunk)

            res.on("end", () => {
              try {
                node.credentials.apiKey = JSON.parse(body).api_keys.find(key => key.write_flag).api_key
              } catch(e) {
                // TODO 
                node.error(e)
              }
            })
          });

          req.on("error", e => 
            console.warn("issues with creating channel")
          )

          let body = `api_key=${node.credentials.accKey}`
          
          // Adding the optional fields
          body = appendIfFilled(body)

          // Adding the individual fields
          node.newFieldNames.forEach((name, index) => {
            if(name) 
              body += `&field${index + 1}=${name}`
          })

          return new Promise(resolve => {
            return req.end(body, "utf8", () => {
              node.option = "existing"
              creationPending = false;
              node.status({fill:"green",shape:"dot",text:"Channel created"});
              return resolve()
            })
          })
        }

        function appendIfFilled(data) {
          const map = [{
            type: "public_flag", 
            value: node.public
          },{
            type: "name",
            value: node.name
          }, {
            type: "description",
            value: node.description
          }, {
            type: "url",
            value: node.url
          }, {
            type: "tags",
            value: node.tags
          }, {
            type: "latitude",
            value: node.lat
          }, {
            type: "longitude",
            value: node.long
          }, {
            type: "elevation",
            value: node.elevation
          }, {
            type: "metadata",
            value: node.meta
          }]

          map.forEach(el => {
            if (el.value) 
              data += `&${el.type}=${el.value}`
          })

          return data
        }

        function publishData() {
            node.status({fill:"blue",shape:"dot",text:"uploading data..."});
            var url = buildThingSpeakURL();
            stopTimer();

            node.log("Posting to ThingSpeak: " + url.replace(node.credentials.apiKey, "XXXXXXXXXX"));
            https.get(url, function(response) {
                    if(response.statusCode == 200){
                        node.log("Posted to ThingSpeak");
                    } else {
                        node.error("Error posting to ThingSpeak: status code " + response.statusCode);
                    }
                }
            ).on('error', function(e) {
                node.error("Error posting to ThingSpeak: " + e);
            });

            clearStoredValues();
        }

        function buildThingSpeakURL() {
            var url = node.endpoint + "/update?api_key=" + node.credentials.apiKey;
            for( i=0; i < node.topics.length; i++ ) {
                var val = getValue(i);
                if (val != null) {
                    url = url + "&field" + (i + 1) + "=" + val;
                }
            }
            return url;
        }

        function updateStatus() {
            if( timeout == null ) {
                status({fill:"green",shape:"dot",text:"ready"});
            } else {
                status({fill:"blue",shape:"ring",text:"waiting to push"});
            }
        }

        function uploadData(msg) {
            for(i=0; i < node.topics.length; i++) {
                if( msg.topic == node.topics[i] ) {
                    storeValue(i, msg.payload);
                    startTimer();
                }
            }
        }

        this.on('input', function(msg) {
          if (node.option === "new") {
            return createChannel()
              .then(() => uploadData(msg))
              .catch(e => {
                if (e !== "duplicate request")
                  return node.status({fill:"red",shape:"dot",text:"Could not create channel"});

                node.error(e)
              }); 
          }

          if (!node.credentials.apiKey) {
            return node.status({fill:"red",shape:"dot",text:"No channel api key"});
          }

          return uploadData(msg)
        });

        this.on('close', function() {
            stopTimer();
        });
    };

    RED.nodes.registerType("thingspeak42",ThingSpeak42Node, {
        credentials: {
            apiKey: {type: "password"},
            accKey: {type: "password"}
        }
    });
};
