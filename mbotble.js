// BLE Mbot bridge
//
// Author: fcgdam/PrimalCortex 2018.
//
// Sample code to connect the computer to the mBot Bluetooth module.
//
// One of the versions of the mbot v1.1 comes with an onboard bluetooth module.
// This module, according to the schematics is wired to the TX/RX arduino pins, and uses the baud rate of 115200.
// So it is possible to communicate with mbot through bluetooth to send commands and receive data. This is what mblock program does.
//
// This code is a stepping stone to enable computer <-> mbot communications so that we can use another protocol and programs instead of mblock.
//
// As far as I'm aware with the available devices that I have:
//
// mBot bluetooth advertises Makeblock_LE name.
//
// After connecting there is one service that has two characteristics:
//
// Service UUID: 0000ffe1-0000-1000-8000-00805f9b34fb   -> We can use the short notation ffe1
//
//  READ UUID: 0000ffe2-0000-1000-8000-00805f9b34fb -> We can use the short notation ffe2
//
//  WRITE UUID: 0000ffe3-0000-1000-8000-00805f9b34fb -> We can use the short notation ffe3
//
// After some testing with some BLE tools, the above UUIDs are the ones that allow to communicate with mbot through BLE.
// Also the READ characteristic supports notification, so our callback for read will be triggered when there is data available from the mBot.
//
// So basically when writing to the write characteristic will send data to the mbot, and when data is available, we get notified.
//
// Overall this works just fine, not very fast, but allows to build on top of this much nicer projects.

const noble   = require('noble');

const devName               = "Makeblock_LE";
const mbotServiceUUID       = "ffe1";
const mbotReadEndPointUUID  = "ffe2";
const mbotWriteEndPointUUID = "ffe3";

// For demo purposes
// Some commands:
// Onboard RGB WS2812 leds
var ledColor1 = new Buffer([0xff, 0x55, 0x09, 0x00, 0x02, 0x08, 0x07, 0x02, 0x00, 0xff, 0xFF, 0x00]);
var ledColor2 = new Buffer([0xff, 0x55, 0x09, 0x00, 0x02, 0x08, 0x07, 0x02, 0x00, 0x00, 0x00, 0xFF]);
// Led Matrix connected to Port 0x04  -----------------------v
var face = new Buffer( [0xff, 0x55 ,0x17 ,0x00 ,0x02 ,0x29 ,0x04 ,0x02 ,0x00 ,0x00 ,0x00 ,0x00 ,0x40 ,0x48 ,0x44 ,0x42 ,0x02 ,0x02 ,0x02 ,0x02 ,0x42 ,0x44 ,0x48 ,0x40 ,0x00 ,0x00]);
// Read Ultrasensor data
var readUS = new Buffer( [0xff, 0x55 ,0x04 ,0x00 ,0x01 ,0x01 ,0x03]);
// Buzzer
var buzz = new Buffer( [0xff, 0x55 ,0x07 ,0x00 ,0x02 ,0x22 ,0x06 ,0x01 ,0xf4 ,0x01]);

// For cycling demo
var loop = 1;

noble.on('stateChange', function(state) {
    console.log("- Bluetooth state change");

    if (state === 'poweredOn') {
        console.log("  - Start scanning...");
        noble.startScanning();
    } else {
        console.log("  - Stopped scanning...");
        noble.stopScanning();
    }
});

noble.on('discover', function(peripheral) {
    var advertisement = peripheral.advertisement;
    var localName = advertisement.localName;

    console.log('! Found device with local name: ' + localName );

    if ( localName == devName ) { 
        noble.stopScanning();
        console.log('! Mbot robot found! ');
        console.log("  - Stopped scanning...");
        console.log('- Connecting to ' + localName + ' ['+ peripheral.id + ']');
        connectTombot( peripheral );
    }
});

function connectTombot(peripheral) {

    peripheral.connect(error => {
        console.log('! Connected to', peripheral.id);

        // specify the services and characteristics to discover
        const serviceUUIDs   = [mbotServiceUUID];
        const charReadUUIDs  = [mbotReadEndPointUUID];
        const charWriteUUIDs = [mbotWriteEndPointUUID];

        // The second parameter defines the set of BLE characteristics that we want to find.
        // But if I specify the mbot read and write chracteristics as an array, noble returns an empty array.
        // So I filter after the discovery.
        peripheral.discoverSomeServicesAndCharacteristics( serviceUUIDs, [], function(error, services, chars ) {
            var mbotService = services[0];
//            console.log("Characte: " , chars[0].uuid);
//            console.log("Characte: " , chars[1].uuid);
    
            if (!error) {	    
                console.log("! mbot BLE service found!");

                for( var i in chars ) {
                    if ( chars[i].uuid == mbotReadEndPointUUID )
                        mbotReadDataDriver( error, mbotService, chars[i] );

                    if ( chars[i].uuid == mbotWriteEndPointUUID )
                        mbotWriteDataDriver( error, mbotService, chars[i] );
                } 

                console.log("- End scanning BLE characteristics.");
            } else {
                console.log("! mbot BLE service not found... Sorry!");
            }
        });

    });

    peripheral.on('disconnect', () => console.log('! Mbot has disconnected...'));
}

function mbotReadDataDriver(error, services, characteristics) {
    var mbotRComms = characteristics;

    console.log('! mbot READ BLE characteristic found.');

    // data callback receives notifications
    mbotRComms.on('data', (data, isNotification) => {
        console.log('> mbot data received: "' + data.toString('hex') + '"');
        // This doesn't work all the time.
        // We are epecting that the received data is a complete answer starting by 0xff and 0x55
        // To be perfect we need to "slide" the buffer looking for 0xff0x55
        if ( data[0] == 0xff )      // Command header
            if ( data[1] == 0x55 )
                if ( data[3] == 0x2 ) { // Float value 
                    var buf = new Buffer(4);
                    buf[3] = data[4];
                    buf[2] = data[5];
                    buf[1] = data[6];
                    buf[0] = data[7];

                    //console.log(buf.toString('hex'));
                    var b = new ArrayBuffer(4);
                    var v = new DataView(b);
                    buf.forEach( function (b,i) {
                        v.setUint8(i,b);
                    });
                    console.log("Distance: " + v.getFloat32(0) );

                }
    });

    // subscribe to be notified whenever the peripheral update the characteristic
    mbotRComms.subscribe(error => {
        if (error) {
            console.error('! Error subscribing to mbot BLE characteristic');
        } else {
            console.log('! Subscribed for mbot read notifications');
        }
    });
}

function mbotWriteDataDriver(error, services, characteristics) {
    var mbotWComms = characteristics;

    console.log('! mbot WRITE BLE characteristic found.');

    // create an interval to send data to the service
    let count = 0;
    setInterval(() => {
        count++;
        //const message = new Buffer('hello, ble ' + count, 'utf-8');
/* 
        if ( loop == 1 ){
            mbotWComms.write( ledColor1 , true, function(error) {
                console.log("Write Led Color1 OK");
            });
        }

        if ( loop == 0 ) {
            mbotWComms.write( ledColor2 , true, function(error) {
                console.log("Write Led Color2 OK");
            });
        }   
*/
        // Read the ultrasound sensor data
        mbotWComms.write( readUS , true , function(error) {
                console.log("Reading the ultrasound sensor data..."); 
        });

        loop = ++loop % 2;

        //if ( (count % 5) == 0) console.log(".");
    }, 1500);
}
