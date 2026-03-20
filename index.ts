import * as net from "net";

let server = net.createServer();

server.on("connection", handleConn);
server.on("error", (err: Error) => { throw err });

server.listen({ host: "127.0.0.1", port: 8080 });

function handleConn(socket: net.Socket): void {
  socket.on("data", (data: Buffer) => {
    if (data.includes('q')) {
      console.log("recieved q")
      socket.end()
      return
    }
    console.log("data:", data)
    socket.write(data)

  });

  socket.on("end", () => {
    console.log("END event recieved") 
  });
}


