const PET_BREEDS = {
    'husky': 'a_c_husky',
    'poodle': 'a_c_poodle',
    'pug': 'a_c_pug',
    'rottweiler': 'a_c_rottweiler',
    'shepherd': 'a_c_shepherd',
    'westy': 'a_c_westy',
    'retriever': 'a_c_retriever',
    'cat': 'a_c_cat_01',
    'chop': 'a_c_chop'
};

mp.events.addCommand('pet', (player, fullText, subcommand, ...args) => {
    if (!subcommand) {
        global.chatSend(player, '!{FFD700}=== Pet System ===');
        global.chatSend(player, '!{FFFFFF}/pet spawn [rasa] - Creaza un pet (default: shepherd)');
        global.chatSend(player, '!{FFFFFF}/pet name <nume> - Da un nume pet-ului');
        global.chatSend(player, '!{FFFFFF}/pet follow - Pet-ul te urmareste');
        global.chatSend(player, '!{FFFFFF}/pet stay - Pet-ul sta pe loc');
        global.chatSend(player, '!{FFFFFF}/pet sit - Pet-ul se aseaza');
        global.chatSend(player, '!{FFFFFF}/pet lay - Pet-ul se culca');
        global.chatSend(player, '!{FFFFFF}/pet come - Pet-ul vine la tine');
        global.chatSend(player, '!{FFFFFF}/pet delete - Sterge pet-ul');
        global.chatSend(player, '!{FFFFFF}/pet breeds - Lista de rase');
        return;
    }

    subcommand = subcommand.toLowerCase();

    switch (subcommand) {
        case 'spawn': {
            if (player.pet) {
                global.chatSend(player, '!{FF0000}Ai deja un pet! Foloseste /pet delete mai intai.');
                return;
            }

            const breedName = args[0] ? args[0].toLowerCase() : 'shepherd';
            const model = PET_BREEDS[breedName];
            if (!model) {
                global.chatSend(player, `!{FF0000}Rasa "${breedName}" nu exista. Foloseste /pet breeds.`);
                return;
            }

            const pos = player.position;
            const heading = player.heading;
            const spawnPos = new mp.Vector3(
                pos.x + Math.cos(heading * Math.PI / 180) * 2,
                pos.y + Math.sin(heading * Math.PI / 180) * 2,
                pos.z
            );

            const ped = mp.peds.new(mp.joaat(model), spawnPos, heading, player.dimension);

            player.pet = {
                ped: ped,
                name: 'Pet',
                breed: breedName,
                state: 'follow'
            };

            player.call('pet:spawn', [ped.id, 'Pet', 'follow']);
            global.chatSend(player, `!{00FF00}Ai primit un ${breedName}! Foloseste /pet name <nume> sa ii dai un nume.`);
            break;
        }

        case 'name': {
            if (!player.pet) {
                global.chatSend(player, '!{FF0000}Nu ai un pet! Foloseste /pet spawn.');
                return;
            }
            const name = args.join(' ');
            if (!name || name.length === 0) {
                global.chatSend(player, '!{FF0000}Foloseste: /pet name <nume>');
                return;
            }
            if (name.length > 20) {
                global.chatSend(player, '!{FF0000}Numele nu poate avea mai mult de 20 de caractere.');
                return;
            }
            player.pet.name = name;
            player.call('pet:updateName', [name]);
            global.chatSend(player, `!{00FF00}Pet-ul tau se numeste acum "${name}".`);
            break;
        }

        case 'follow': {
            if (!player.pet) {
                global.chatSend(player, '!{FF0000}Nu ai un pet! Foloseste /pet spawn.');
                return;
            }
            player.pet.state = 'follow';
            player.call('pet:order', ['follow']);
            global.chatSend(player, `!{00FF00}${player.pet.name} te urmareste acum.`);
            break;
        }

        case 'stay': {
            if (!player.pet) {
                global.chatSend(player, '!{FF0000}Nu ai un pet! Foloseste /pet spawn.');
                return;
            }
            player.pet.state = 'stay';
            player.call('pet:order', ['stay']);
            global.chatSend(player, `!{00FF00}${player.pet.name} sta pe loc.`);
            break;
        }

        case 'sit': {
            if (!player.pet) {
                global.chatSend(player, '!{FF0000}Nu ai un pet! Foloseste /pet spawn.');
                return;
            }
            player.pet.state = 'sit';
            player.call('pet:order', ['sit']);
            global.chatSend(player, `!{00FF00}${player.pet.name} s-a asezat.`);
            break;
        }

        case 'lay': {
            if (!player.pet) {
                global.chatSend(player, '!{FF0000}Nu ai un pet! Foloseste /pet spawn.');
                return;
            }
            player.pet.state = 'lay';
            player.call('pet:order', ['lay']);
            global.chatSend(player, `!{00FF00}${player.pet.name} s-a culcat.`);
            break;
        }

        case 'come': {
            if (!player.pet) {
                global.chatSend(player, '!{FF0000}Nu ai un pet! Foloseste /pet spawn.');
                return;
            }
            player.pet.state = 'follow';
            player.call('pet:order', ['come']);
            global.chatSend(player, `!{00FF00}${player.pet.name} vine la tine.`);
            break;
        }

        case 'delete': {
            if (!player.pet) {
                global.chatSend(player, '!{FF0000}Nu ai un pet!');
                return;
            }
            const petName = player.pet.name;
            if (player.pet.ped && mp.peds.exists(player.pet.ped)) {
                player.pet.ped.destroy();
            }
            player.call('pet:delete');
            player.pet = null;
            global.chatSend(player, `!{FF6600}${petName} a plecat.`);
            break;
        }

        case 'breeds': {
            global.chatSend(player, '!{FFD700}=== Rase Disponibile ===');
            Object.keys(PET_BREEDS).forEach(breed => {
                global.chatSend(player, `!{FFFFFF}- ${breed}`);
            });
            break;
        }

        default:
            global.chatSend(player, '!{FF0000}Comanda necunoscuta. Foloseste /pet pentru ajutor.');
            break;
    }
});

// Cleanup pet when player disconnects
mp.events.add('playerQuit', (player) => {
    try {
        if (player.pet && player.pet.ped && mp.peds.exists(player.pet.ped)) {
            player.pet.ped.destroy();
        }
    } catch (e) {}
});

// Cleanup pet if player dies
mp.events.add('playerDeath', (player) => {
    try {
        if (player.pet && player.pet.ped && mp.peds.exists(player.pet.ped)) {
            player.pet.ped.destroy();
        }
        if (player.pet) {
            player.call('pet:delete');
            player.pet = null;
        }
    } catch (e) {}
});
