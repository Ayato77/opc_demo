import {
    OPCUAClient,
    MessageSecurityMode,
    SecurityPolicy,
    AttributeIds,
    makeBrowsePath,
    ClientSubscription,
    TimestampsToReturn,
    MonitoringParametersOptions,
    ReadValueIdOptions,
    ClientMonitoredItem,
    DataValue
} from "node-opcua";

const connectionStrategy = {
    initialDelay: 1000,
    maxRetry: 1
}
const options = {
    applicationName: "MyClient",
    connectionStrategy: connectionStrategy,
    securityMode: MessageSecurityMode.None,
    securityPolicy: SecurityPolicy.None,
    endpointMustExist: false,
};
const client = OPCUAClient.create(options);
// const endpointUrl = "opc.tcp://opcuademo.sterfive.com:26543";
//const endpointUrl = "opc.tcp://opcuaserver.com:48010";
const endpointUrl = "opc.tcp://192.168.0.1:4840";//address of opc server at mock factory

async function timeout(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {

    const mqtt = require('mqtt')
    const options = {
    //clientId:optionJSON.clientId,
    port:1883,
    host:'192.168.0.10',//Von der Lernfabrik
    rejectUnauthorized: false,
    reconnectPeriod: 1000
    }
    const mqttClient  = mqtt.connect(options);

    mqttClient.on('connect', function () {
        mqttClient.subscribe('presence', function (err) {
            if (!err) {
                mqttClient.publish('connection', 'MQTT: Connected')//JSON Format!!
            }
        })
    })

    //Listening messages from the broker
    mqttClient.on('message', function (topic, message) {
        // message is Buffer
        console.log(message.toString())
    })

    //Display error
    client.on('error', function(err) {
        console.dir(err)
    })


    try {
        // step 1 : connect to
        await client.connect(endpointUrl);
        console.log("connected !");

        // step 2 : createSession
        const session = await client.createSession();
        console.log("session created !");

        // step 3 : browsing root folder
        const browseResult = await session.browse("RootFolder");

        console.log("references of RootFolder :");
        for(const reference of browseResult.references) {
            console.log( "   -> ", reference.browseName.toString());
        }

        // step 4 : read a variable with readVariableValue
        const dataValue2 = await session.read({
            nodeId: 'ns=3;s="QX_MPO_LightOven_Q9"',//Ist Ofen an? semi colon aufpassen
            attributeId: AttributeIds.Value
        });
        console.log(" value = ", dataValue2.toString());

        // step 4' : read a variable with read
        const maxAge = 0;
        const nodeToRead = {
            nodeId: 2258,
            attributeId: AttributeIds.Value
        };
        const dataValue = await session.read(nodeToRead, maxAge);
        console.log(" value ", dataValue.toString());

        // step 5: install a subscription and install a monitored item for 10 seconds
        const subscription = ClientSubscription.create(session, {
            requestedPublishingInterval: 1000,
            requestedLifetimeCount: 100,
            requestedMaxKeepAliveCount: 10,
            maxNotificationsPerPublish: 100,
            publishingEnabled: true,
            priority: 10
        });

        subscription
            .on("started", function() {
                console.log(
                    "subscription started for 2 seconds - subscriptionId=",
                    subscription.subscriptionId
                );
            })
            .on("keepalive", function() {
                console.log("keepalive");
            })
            .on("terminated", function() {
                console.log("terminated");
            });

// install monitored item

        const itemToMonitor: ReadValueIdOptions = {
            nodeId: "ns=1;s=free_memory",
            attributeId: AttributeIds.Value
        };
        const parameters: MonitoringParametersOptions = {
            samplingInterval: 100,
            discardOldest: true,
            queueSize: 10
        };

        const monitoredItem = ClientMonitoredItem.create(
            subscription,
            itemToMonitor,
            parameters,
            TimestampsToReturn.Both
        );

        //TODO:check here the time and temperature of the oven
        /*
        * Depending on the temperature, decide if the baking time is appropriate.
        * Then send the information via MQTT.
        * This message should be received by a RasPi/ESP at the conveyor or vacuum lifter.
        * The receiver sends a remove command if the corresponding product is defect
        * */
        monitoredItem.on("changed", (dataValue: DataValue) => {
            console.log(" value has changed : ", dataValue.value.toString());
        });

        //TODO: Set subscription time to infinity
        await timeout(10000);

        //TODO: Terminate subscription only if there is an error
        console.log("now terminating subscription");
        await subscription.terminate();

        // step 6: finding the nodeId of a node by Browse name
        const browsePath = makeBrowsePath("RootFolder", "/Objects/Server.ServerStatus.BuildInfo.ProductName");

        const result = await session.translateBrowsePath(browsePath);
        const productNameNodeId = result.targets[0].targetId;
        console.log(" Product Name nodeId = ", productNameNodeId.toString());

        // close session
        await session.close();

        // disconnecting
        await client.disconnect();
        console.log("done !");
    } catch(err) {
        console.log("An error has occured : ",err);
    }
}


main();


