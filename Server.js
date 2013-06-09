var app = require('http').createServer(serverHandler),
	util = require('util'),
	sys = require('sys'),
	io = require('socket.io').listen(app);

app.listen(6969);

function serverHandler(req, res) {
	sys.puts('ok');
}

var turno = 0;
var parrilla = new Array();
var equipoActual = -1;
var listaJugadores = new Array();
var clientes = []; 
var juegos = []; 

for (var i = 0; i < 9; i++)
{
	parrilla.push(0);
}


var combinacionGanadora = [	[0,1,2], [3,4,5], [6,7,8],
					[0,3,6], [1,4,7], [2,5,8],
					[0,4,8], [2,4,6] ]; 
	
var init = function()
{
	turno = 0;
	equipoActual = -1;
	parrilla = new Array();
	for (i = 0; i < 9; i++)
		parrilla.push(0);
};

io.sockets.on('connection', function (socket) {
	
	socket.emit('connection', {state:true});
	
	// Desconexion de un cliente
	socket.on('disconnect', function() {
		
		sys.puts('cliente desconectado');
		var juego = regresaJuegoPorJugadorId(socket.id);
		if (juego)
		{
			juego.cancelar(socket.id); // Cancela el juego
			borraJuego(juego); // Elimina el juego de la lista
		}
		
		borraJugadorPorId(socket.id); // Elimina al jugador
		
		//Se envia lista de jugadores actualizada
		mybroadcast(socket, 'actualizarConteoDeJugadores',{jugadores:listaJugadores});
	});
		
	socket.on('jugada', function(data) {
	    // data contiene posicion y el id de la sesion de conexion
	    // {pos:pos, id:socket.socket.sessionid}
		var juego = regresaJuegoPorJugadorId(data.id);
		
		if (!juego)
		{//Error en el identificador de juego
			socket.emit('juegoEquivocado');
			return;
		}
		
		//Verifica si la jugada es valida
		if (!juego.jugar(data.id, data.pos))
		{// La jugada no es válida
			socket.emit('jugadorEquivocado');
			return;
		}
		
		io.sockets.socket(juego.jugadores[0]).emit('respuestaDeJuego', 
			                                   {estado:true, equipo:(juego.turno)%2, pos:data.pos,
			                                   	jugadorEnTurno:regresaJugadorPorId(juego.jugadores[(juego.turno)%2]).nombreUsuario});
		io.sockets.socket(juego.jugadores[1]).emit('respuestaDeJuego',
		                                       {estado:true, equipo:(juego.turno)%2, pos:data.pos,
		                                       	jugadorEnTurno:regresaJugadorPorId(juego.jugadores[(juego.turno)%2]).nombreUsuario});

		var ganar = juego.checaSiGana();
		
		if (ganar)
		{
			if (ganar == juego.jugadores[0])
			{
				io.sockets.socket(juego.jugadores[0]).emit('ganar', {yo:true});
				io.sockets.socket(juego.jugadores[1]).emit('ganar', {yo:false, ganador:regresaJugadorPorId(juego.jugadores[0]).nombreUsuario});
			}
			else if (ganar == juego.jugadores[1])
			{
				io.sockets.socket(juego.jugadores[1]).emit('ganar', {yo:true});
				io.sockets.socket(juego.jugadores[0]).emit('ganar', {yo:false, ganador:regresaJugadorPorId(juego.jugadores[1]).nombreUsuario});
			}	
			borraJuego(juego);
		}
		else if(juego.turno > 8)
		{
			console.log('TURNO'+turno);
			io.sockets.socket(juego.jugadores[0]).emit('posibleEmpate',{turno:juego.turno});
			io.sockets.socket(juego.jugadores[1]).emit('posibleEmpate',{turno:juego.turno});
			borraJuego(juego);
		}
		
	});
	

	// Registra jugador en la lista
	socket.on('registrarJugador', function(data) {
		//data contiene nombreUsuario y sessionid

		for (var i = 0; i < listaJugadores.length; i++)
		{
			if (listaJugadores[i].id == data.id)
			{// El id del jugador se encuentra registrado
				socket.emit('idEnUso');
				return;
			}
			else if (listaJugadores[i].nombreUsuario == data.nombreUsuario)
			{// El nombre de usuario ya se encuentra en uso
				socket.emit('nombreUsuarioEstaRegistrado');
				return;
			}
		}
		
		var nuevoJugador = new Jugador(data.id, data.nombreUsuario);
		// Inserta jugador en la lista de jugadores
		listaJugadores.push(nuevoJugador);
        
        // Guarda los datos del nuevo jugador 'cliente'
		var nuevoCliente = {};
		nuevoCliente.id = data.id; // Identificador
		nuevoCliente.conexion = socket; // Socket de conexion
		clientes.push(nuevoCliente); // Lo inserta en el arreglo de clientes

		// Apagar el boton de registro
		socket.emit('apagarBotonRegistrar');

		// Llamada a actualizar lista de jugadores, envia: socket, y la lista de jugadores
		mybroadcast(socket, 'actualizarConteoDeJugadores',{jugadores:listaJugadores});
	});	

	// Envia invitacion de juego
	socket.on('invitarJugador', function(data) {
	    // data - > contiene el sessionid

	    // Toma datos del jugador del socket actual de la lista de jugadores
	    // que es quien genera la invitacion
		var jugador = regresaJugadorPorId(socket.id); 
		//console.log("Desde invitarJugador; Nombre del jugador " + player.nombreUsuario);
		
		if (!jugador)
		{// jugador actual no registrado	
			socket.emit('noRegistrado');
			return;
		}
		
		//Regresa socket de conexion del jugador al que se quiere invitar
		var conexionCliente = regresaClientePorId(data.id);
		
		if (!conexionCliente)
		{// Error en ID del jugador a invitar
			socket.emit('idDeInvitacionErroneo');
			return;
		}

		// Verifica si el jugador a invitar se encuentra en un juego
		if (regresaJuegoPorJugadorId(data.id))
		{// El jugador ha invitar ya se encuentra jugando
			socket.emit('estaJugando', {name:regresaJugadorPorId(data.id).nombreUsuario});
			return;
		}
		
		if (socket.id == data.id)
		{// No se puede jugar con uno mismo
			socket.emit('tuMismo');
			return;
		}
		
		// Se envia la invitacion de juego
		conexionCliente.emit('invitacion', {id:socket.id, nombreUsuario:jugador.nombreUsuario}); // Envia la invitacion
		// con el id del jugador que genera la invitacion (jugador actual)
		jugador.agregaJugadorAFilaDeEspera(data.id); // Agrega el jugador al que se esta invitando a la lista de espera
		// del jugador que invita
	});
	
	// Acepta la invitacion del juego
	socket.on('aceptar', function(data) {
		// data - > contiene jugador1ID es quien invita y jugador2ID a quien queremos invitar

		var jugador1 = regresaJugadorPorId(data.jugador1Id);
	
		if (!jugador1)
		{// Error en el id del jugador que invita
			socket.emit('idDeInvitacionErroneo');
			return false;
		}
		
		if (!jugador1.estaEnFila(data.jugador2Id))
		{// Error en el id del primer jugador
			socket.emit('idDeInvitacionErroneo');
			return false;
		}
		
		jugador1.borrarJugadorDeFilaDeEspera(data.jugador2Id); // Borra jugador1 de la lista de espera
		var jugador2 = regresaJugadorPorId(data.jugador2Id);
		
		if (!jugador2)
		{// Error, el jugador no se encuentra en la lista de jugadores
			socket.emit('idDeInvitacionErroneo');
			return false;
		}
		
		var nuevoJuego = new Juego(jugador1.id, jugador2.id);
		nuevoJuego.id = uniqId;
		nuevoJuego.jugadores = [jugador1.id, jugador2.id];
		nuevoJuego.parrilla = new Array;
		for (var i = 0; i < 9; i++)
			nuevoJuego.parrilla.push(-1);
		nuevoJuego.turno = 0;
		nuevoJuego.estado = 1;
		juegos.push(nuevoJuego); //Coloca nuevo juego en la lista
		jugador1.estado = 1; // Jugador dentro de juego
		jugador2.estado = 1; // Jugador dentro de juego

		io.sockets.socket(jugador1.id).emit('jugadorEstaListo',
		            {estado:true, turno:regresaJugadorPorId(jugador1.id).nombreUsuario, id:jugador1.id});
		io.sockets.socket(jugador2.id).emit('jugadorEstaListo', 
			        {estado:true, turno:regresaJugadorPorId(jugador1.id).nombreUsuario, id:jugador1.id});
	});
	
	// Maneja el rechazo de la invitacion de un jugador
	socket.on('declinar', function(data) {
		// data -> contiene los Id de los jugadores
		//Jugador1 es a quien se le rechaza la invitacion
		//console.log('ESTOY EN DECLINAR: JUGADOR1' + data.jugador1Id + 'JUGADOR 2 ' + data.jugador2Id);
		regresaJugadorPorId(data.jugador1Id).borrarJugadorDeFilaDeEspera(data.jugador2Id);
		io.sockets.socket(data.jugador1Id).emit('declinarLadoCliente',
		     {vieneDe:regresaJugadorPorId(data.jugador2Id).nombreUsuario,vieneDeId:data.jugador2Id});
	});


	socket.on('limpiaInvitacionEnviada',function(data){
		//{jugadorInvitado:jugadoresInvitados[i], jugadorAnfitrion:socket.socket.sessionid}
		var conexionCliente = regresaClientePorId(data.jugadorInvitado);
		console.log('CONEXION CLIENTE '+data.jugadorInvitado);
		conexionCliente.emit('limpiaInvitacionLC', {idAnfitrion:data.jugadorAnfitrion}); // Envia la invitacion
	});


	socket.on('enMedioDelJuego',function(data){
		//{idDeQuienInvita:data.id,idResponde:socket.socket.sessionid}
		//Para saber si termino el juego
		console.log('EL DESTINO: '+data.idDeQuienInvita);
		var conexionCliente = regresaClientePorId(data.idDeQuienInvita);
		conexionCliente.emit('enMedioDelJuego',{nombreUsuario:regresaJugadorPorId(data.idResponde).nombreUsuario})
	});


});

// Envia la lista de jugadores a todos los conectados
var mybroadcast = function(socket, mensaje, data)
{ // recibe: socket, 'actualizarListaDeJugadores', y data -> la lista de jugadores
	//console.log("Estoy en brodcast");

	// En message se encuentra el nombre de la funcion a llamar
	socket.broadcast.emit(mensaje, data); // Envia lista jugadores a todos los conectados
	socket.emit(mensaje, data); // Regresa lista actualizada a quien genero la llamada
};

// Elimina jugador de la lista de jugadores
var borraJugadorPorId = function(id)
{
	var temp = new Array();
	for (var i = 0; i < listaJugadores.length; i++)
		if (listaJugadores[i].id != id)
			temp.push(listaJugadores[i]);
	
	listaJugadores = temp;	// Remplaza lista de jugadores con la actualizada
}; 

// Borra el juego del arreglo de juegos
var borraJuego = function(juego)
{ // juego  -> contiene el juego que se esta cancelando
	var temp = new Array();
	for (var i = 0; i < juegos.length; i++)
		if (juego.id != juegos[i].id)
			temp.push(juegos[i]);
	
	juegos = temp;
};

// Regresa jugador de la lista de jugadores buscando por Id
var regresaJugadorPorId = function (id){
	// id -> contiene el sessionid
	for (var i = 0; i < listaJugadores.length; i++)
		if (listaJugadores[i].id == id)
			return listaJugadores[i];
	return false;
};

// Regresa conexion de cliente de la lista de clientes buscando por Id
var regresaClientePorId = function (id)
{
	for (var i = 0; i < clientes.length; i++)
		if (clientes[i].id == id)
			return clientes[i].conexion;
	return false;
};

// Regresa falso si el jugador a invitar no se encuentra en un juego,
// o el Juego en caso contrario
var regresaJuegoPorJugadorId = function(id)
{
	for (var i = 0; i < juegos.length; i++)
		if (juegos[i].jugadores[0] == id || juegos[i].jugadores[1] == id)
			return juegos[i];
	return false;
};

var uniqId = function() {

    var S4 = function ()
    {
        return Math.floor(
                Math.random() * 0x10000 /* 65536 */
            ).toString(16);
    };

    return (
            S4() + S4() + "-" +
            S4() + "-" +
            S4() + "-" +
            S4() + "-" +
            S4() + S4() + S4()
        );
};

// Se define el objeto jugador 
var Jugador = function(id, nombreUsuario)
{
	this.id = id;
	this.nombreUsuario = nombreUsuario;
	this.estado = 0;
	this.juegos = {};
	this.filaDeEspera = [];
	
	// Agregar a lista de espera
	this.agregaJugadorAFilaDeEspera = function(id)
	{
		this.filaDeEspera.push(id);
	};
	
	// Eliminar de lista de espera
	this.borrarJugadorDeFilaDeEspera = function(id)
	{
		var temp = new Array();
		for (var i = 0; i < this.filaDeEspera.length; i++)
			if (this.filaDeEspera[i] != id)
				temp.push(id);
		this.filaDeEspera = temp;
	};
	
	// Cambia el estado del jugador
	this.cambiarEstado = function(nuevoEstado)
	{
		this.estado = nuevoEstado;
	};
	
	// Verifica si el jugador esta en la lista de espera
	this.estaEnFila = function (id)
	{
		for (var i = 0; i < this.filaDeEspera.length; i++)
			if (this.filaDeEspera[i] == id)
				return true;
		return false;
	};
	
	// Retorna conexion de cliente de la lista de clientes
	this.tomaCliente = function()
	{
		for (var i = 0; i < clientes.length; i++)
			if (clientes[i].id = this.id)
				return clientes[i].conexion;
		return false;
	};
};


// Se define el objeto Juego
var Juego = function(jugador1, jugador2) 
{
	this.id = uniqId();
	this.jugadores = [jugador1, jugador2];
	this.parrilla = new Array();
	this.turno = 0;
	this.estado = 1;

	for (var i = 0; i < 9; i++)
		this.parrilla.push(-1);
	
	// JUGAR		
	this.jugar = function(id, pos){

		sys.puts('TURNO : ' + this.turno%2);

		if (this.jugadores.indexOf(id) == this.turno%2)

			if (this.parrilla[pos] == -1) //La jugada es válida
			{
				this.parrilla[pos] = this.turno%2; //Asigna turno del jugador
				this.turno++;
				sys.puts(sys.inspect(this.parrilla));
				return true;
			}
			else
				return false;
		else
			return false;
	};
	
	// Verifica si GANA
	this.checaSiGana = function()
	{// Si hay ganador lo retorna, si no retorna false
		for (var i = 0; i < combinacionGanadora.length; i++)
			if (this.parrilla[combinacionGanadora[i][0]] == (this.turno+1)%2 &&
			    this.parrilla[combinacionGanadora[i][1]] == (this.turno+1)%2 &&
			    this.parrilla[combinacionGanadora[i][2]] == (this.turno+1)%2)
			{
				this.estado = 0;
				return this.jugadores[(this.turno+1)%2];
			}
			console.log('VALOR DE I:'+i);
		return false;
	};
	
	// Envia aviso de juego cancelado al cliente 
	this.cancelar = function(leaver)
	// leaver contiene el Id del ciente que se desconecta
	{ 
		var index = (this.jugadores.indexOf(leaver) ? 0 : 1);
		io.sockets.socket(this.jugadores[index]).emit('gameCancelled', {name:regresaJugadorPorId(leaver).nombreUsuario});
	};
};