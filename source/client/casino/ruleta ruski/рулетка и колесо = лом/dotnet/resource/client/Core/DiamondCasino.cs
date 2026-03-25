using GTANetworkAPI;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using NeptuneEvo.Core;
using NeptuneEvo.GUI;
using Redage.SDK;
using NeptuneEvo;
using Trigger = Redage.SDK.Trigger;
using NeptuneEvo.MoneySystem;
using Newtonsoft.Json;
using System.Data;
using NeptuneEvo.Houses;

namespace Redage
{
    class DiamondCasino : Script
    {
        private static nLog Log = new nLog("Casino");
        private static Config config = new Config("Casino");

        private static readonly Random random = new Random();
        private static readonly byte[] webnums = new byte[37] { 0, 14, 31, 2, 33, 18, 27, 6, 21, 10, 19, 23, 4, 25, 12, 35, 16, 29, 8, 34, 13, 32, 9, 20, 17, 30, 1, 26, 5, 7, 22, 11, 36, 15, 28, 3, 24 }; // номера ячейки для каждого числа 0, 1, 2 и т.д.
        private static int[] rednums = new int[18] { 1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36 }; // Все красные числа на рулетке

        private static Dictionary<Player, (ushort, ushort, ushort)> PlayersList = new Dictionary<Player, (ushort, ushort, ushort)>();
        //RED. ZERO, BLACK
        private static long minBalance = config.TryGet<long>("minBalance", 15000);
        private static float colRadius = config.TryGet<float>("ShapeRadius", 2);
        private static Vector3 colPosition = new Vector3
        (
            927.6365,
            44.86219,
            80.9
        );
        private static Vector3 blipPosition = new Vector3
        (
            927.6365,
            44.86219,
            80.9
        );

        public static Dictionary<int, int> WheelPrizes = new Dictionary<int, int>(){
            { 1, 3 },
            { 2, 1 },
            { 3, 2 },
            { 4, 4 },
            { 5, 2 },
            { 6, 1 },
            { 7, 2 },
            { 8, 4 },
            { 9, 3 },
            { 10, 1 },
            { 11, 4 },
            { 12, 6 },
            { 13, 3 },
            { 14, 1 },
            { 15, 2 },
            { 16, 4 },
            { 17, 3 },
            { 18,1 },
            { 19, 5},
            { 20, 2 },
        };

        public static Dictionary<int, List<int>> PrizesNums = new Dictionary<int, List<int>>()
        {
            {1, new List<int>(){ 2, 6, 10, 14, 18} },
            {2, new List<int>(){ 3, 5, 7, 15, 20} },
            {3, new List<int>(){ 1, 9, 13, 17} },
            {4, new List<int>(){ 4, 8, 11, 16} },
            {5, new List<int>(){ 19 } },
            {6, new List<int>(){ 12} }
        };

        public static List<string> PrizesType = new List<string>()
        {
            "-",
            "еду",
            "деньги",
            "одежду",
            "донат",
            "машину",
            "неизвестное",
        };

        public static List<string> PrizesCar = new List<string>()
        {
            "adder",
            "bf400",
            "zentorno",
            "ruston",
        };


        public static List<int> RouletteTableBetMin = new List<int>()
        {
        };


        public static List<int> RouletteTableBetMax = new List<int>()
        {
        };

        public static List<List<Bet>> RouletteBets = new List<List<Bet>>()
        {
            new List<Bet>(){},
            new List<Bet>(){},
        };

        public static List<Vector3> RouletteTables = new List<Vector3>()
        {
             new Vector3(1144.814, 268.2634, -52.8409),
             new Vector3(1150.355, 262.7224, -52.8409),
            // new Vector3(1144.814, 268.2634, -52.8409), 
        };

        public static List<List<Vector3>> RouletteSeats = new List<List<Vector3>>()
        {
            new List<Vector3>(){
                new Vector3(1144.717, 267.277, -52.840),
                new Vector3(1143.748, 267.377, -52.840),
                new Vector3(1143.655, 268.335, -52.840),
                new Vector3(1144.342, 269.022, -52.840),
            },
            new List<Vector3>(){
                new Vector3(1150.45, 263.708, -52.84),
                new Vector3(1151.42, 263.608, -52.84),
                new Vector3(1151.51, 262.650, -52.84),
                new Vector3(1150.82, 261.963, -52.84),
            },
        };

        private static Vector3 casinoEnter = new Vector3(935.9108, 47.1274, 79.97577);
        private static Vector3 casinoExit = new Vector3(1090.557, 206.9167, -50.11975);
        private static string blipName = config.TryGet<string>("BlipName", "Casino");
        private static byte blipColor = config.TryGet<byte>("BlipColor", 0);
        private static uint blipID = config.TryGet<uint>("BlipID", 605);
        private static string PrizeVehicleHash = "Zorrusso";

        private static ColShape colShape;
        private static Blip blip;

        //public static GTANetworkAPI.Object bWheel;
        public static GTANetworkAPI.Object Wheel;

        public static bool isRoll = false;
        public static Player rollPlayer;

        public static List<Thread> CasinoThreads = new List<Thread>();

        public static int ChipPrice = 100;
        public static Dictionary<int, List<int>> Spots = new Dictionary<int, List<int>>()
        {
            { 0, new List<int>{ 0 } },
            { 1, new List<int>{ -1 } },
            { 2, new List<int>{ 1 } },
            { 3, new List<int>{ 2 } },
            { 4, new List<int>{ 3 } },
            { 5, new List<int>{ 4 } },
            { 6, new List<int>{ 5 } },
            { 7, new List<int>{ 6 } },
            { 8, new List<int>{ 7 } },
            { 9, new List<int>{ 8 } },
            { 10, new List<int>{ 9 } },
            { 11, new List<int>{ 10 } },
            { 12, new List<int>{ 11 } },
            { 13, new List<int>{ 12 } },
            { 14, new List<int>{ 13 } },
            { 15, new List<int>{ 14 } },
            { 16, new List<int>{ 15 } },
            { 17, new List<int>{ 16 } },
            { 18, new List<int>{ 17 } },
            { 19, new List<int>{ 18 } },
            { 20, new List<int>{ 19 } },
            { 21, new List<int>{ 20 } },
            { 22, new List<int>{ 21 } },
            { 23, new List<int>{ 22 } },
            { 24, new List<int>{ 23 } },
            { 25, new List<int>{ 24 } },
            { 26, new List<int>{ 25 } },
            { 27, new List<int>{ 26 } },
            { 28, new List<int>{ 27 } },
            { 29, new List<int>{ 28 } },
            { 30, new List<int>{ 29 } },
            { 31, new List<int>{ 30 } },
            { 32, new List<int>{ 31 } },
            { 33, new List<int>{ 32 } },
            { 34, new List<int>{ 33 } },
            { 35, new List<int>{ 34 } },
            { 36, new List<int>{ 35 } },
            { 37, new List<int>{ 36 } },
            { 38, new List<int>{ 0, -1 } },
            { 39, new List<int>{ 1, 2 } },
            { 40, new List<int>{ 2, 3 } },
            { 41, new List<int>{ 4, 5 } },
            { 42, new List<int>{ 5, 6 } },
            { 43, new List<int>{ 7, 8 } },
            { 44, new List<int>{ 8, 9 } },
            { 45, new List<int>{ 10, 11 } },
            { 46, new List<int>{ 11, 12 } },
            { 47, new List<int>{ 13, 14 } },
            { 48, new List<int>{ 14, 15 } },
            { 49, new List<int>{ 16, 17 } },
            { 50, new List<int>{ 17, 18 } },
            { 51, new List<int>{ 19, 20 } },
            { 52, new List<int>{ 20, 21 } },
            { 53, new List<int>{ 22, 23 } },
            { 54, new List<int>{ 23, 24 } },
            { 55, new List<int>{ 25, 26 } },
            { 56, new List<int>{ 26, 27 } },
            { 57, new List<int>{ 28, 29 } },
            { 58, new List<int>{ 29, 30 } },
            { 59, new List<int>{ 31, 32 } },
            { 60, new List<int>{ 32, 33 } },
            { 61, new List<int>{ 34, 35 } },
            { 62, new List<int>{ 35, 36 } },
            { 63, new List<int>{ 1, 4 } },
            { 64, new List<int>{ 2, 5 } },
            { 65, new List<int>{ 3, 6 } },
            { 66, new List<int>{ 4, 7 } },
            { 67, new List<int>{ 5, 8 } },
            { 68, new List<int>{ 6, 9 } },
            { 69, new List<int>{ 7, 10 } },
            { 70, new List<int>{ 8, 11 } },
            { 71, new List<int>{ 9, 12 } },
            { 72, new List<int>{ 10, 13 } },
            { 73, new List<int>{ 11, 14 } },
            { 74, new List<int>{ 12, 15 } },
            { 75, new List<int>{ 13, 16 } },
            { 76, new List<int>{ 14, 17 } },
            { 77, new List<int>{ 15, 18 } },
            { 78, new List<int>{ 16, 19 } },
            { 79, new List<int>{ 17, 20 } },
            { 80, new List<int>{ 18, 21 } },
            { 81, new List<int>{ 19, 22 } },
            { 82, new List<int>{ 20, 23 } },
            { 83, new List<int>{ 21, 24 } },
            { 84, new List<int>{ 22, 25 } },
            { 85, new List<int>{ 23, 26 } },
            { 86, new List<int>{ 24, 27 } },
            { 87, new List<int>{ 25, 28 } },
            { 88, new List<int>{ 26, 29 } },
            { 89, new List<int>{ 27, 30 } },
            { 90, new List<int>{ 28, 31 } },
            { 91, new List<int>{ 29, 32 } },
            { 92, new List<int>{ 30, 33 } },
            { 93, new List<int>{ 31, 34 } },
            { 94, new List<int>{ 32, 35 } },
            { 151, new List<int>{ 2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35} },
            { 152, new List<int>{ 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35} },
            { 153, new List<int>{ 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36} },
        };

        public static List<int> RouletteColors = new List<int>()
        {
            -1,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            -1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1
        };

        public static Dictionary<int, int> RouletteNumbers = new Dictionary<int, int>()
        {
            {-1, 1 },
            {0, 20 },
            {1, 38 },
            {2, 19 },
            {3, 34 },
            {4, 15 },
            {5, 30 },
            {6, 11 },
            {7, 26 },
            {8, 7 },
            {9, 22 },
            {10, 3 },
            {11, 25 },
            {12, 6 },
            {13, 37 },
            {14, 18 },
            {15, 33 },
            {16, 14 },
            {17, 29 },
            {18, 10 },
            {19, 8 },
            {20, 27 },
            {21, 12 },
            {22, 31 },
            {23, 16 },
            {24, 35 },
            {25, 4 },
            {26, 23 },
            {27, 2},
            {28, 21 },
            {29, 5 },
            {30, 24 },
            {31, 9 },
            {32, 28 },
            {33, 13 },
            {34, 32 },
            {35, 17 },
            {36, 36 },
        };


        public static float LastY = 0f;
        //public static int j = 0;

        public static List<int> RouletteBetTime = new List<int>()
        {
            0, 0
        };
        public static List<List<Player>> RoulettePlayers = new List<List<Player>>() {
            new List<Player>(){ },
            new List<Player>(){ },
        };

        public static List<int> RouletteStatus = new List<int>() {
            0,
            0
        };

        public static List<int> RouletteNum = new List<int>() {
            0,
            0
        };


        public static List<List<Player>> RouletteSeatsPlayers = new List<List<Player>>() {
            new List<Player>(){ },
            new List<Player>(){ },
        };

        [Command("addchips")]
        public static void AddChips(Player player)
        {
            nInventory.Add(player, new nItem(ItemType.CasinoChips, 10000));
        }

        [ServerEvent(Event.ResourceStart)]
        public static void OnResourceStart()
        {

            try
            {

                var result = MySQL.QueryRead($"SELECT * FROM `casinoroulette`");
                if (result == null || result.Rows.Count == 0)
                {
                    Log.Write("DB return null result.", nLog.Type.Warn);
                    return;
                }
                foreach (DataRow Row in result.Rows)
                {
                    try
                    {
                        var id = Convert.ToInt32(Row["id"].ToString());
                        var minbet = Convert.ToInt32(Row["minbet"]);
                        var maxbet = Convert.ToInt32(Row["maxbet"]);

                        RouletteTableBetMin.Add(minbet);
                        RouletteTableBetMax.Add(maxbet);
                 
                    }
                    catch (Exception e)
                    {
                        Log.Write(Row["id"].ToString() + e.ToString(), nLog.Type.Error);
                    }

                }
            }
            catch
            {

            }
            colShape = NAPI.ColShape.CreateCylinderColShape(colPosition, colRadius, 2);
            colShape.OnEntityEnterColShape += (ColShape shape, Player Player) =>
            {
                NAPI.Data.SetEntityData(Player, "INTERACTIONCHECK", 70);
            };
            colShape.OnEntityExitColShape += (ColShape shape, Player Player) =>
            {
                NAPI.Data.SetEntityData(Player, "INTERACTIONCHECK", 0);
            };
            colShape.Position = colPosition;


            NAPI.Marker.CreateMarker(0, casinoEnter + new Vector3(0.0, 0.0, 1.2), new Vector3(), new Vector3(), 1f, new Color(255, 255, 0));
            NAPI.Marker.CreateMarker(0, casinoExit + new Vector3(0.0, 0.0, 1.2), new Vector3(), new Vector3(), 1f, new Color(255, 255, 0));
            NAPI.Marker.CreateMarker(1, new Vector3(1087.3715, 219.1609, -50.320377) + new Vector3(0.0, 0.0, 0.2), new Vector3(), new Vector3(), 1f, new Color(255, 255, 0));
            NAPI.TextLabel.CreateTextLabel("Выдача приза", new Vector3(1087.3715, 219.1609, -49.520377), 10f, 1f, 0, new Color(255, 255, 255));

            var casinoEnterCol = NAPI.ColShape.CreateCylinderColShape(casinoEnter, 2, 2);
            casinoEnterCol.OnEntityEnterColShape += (ColShape shape, Player Player) =>
            {
                NAPI.Data.SetEntityData(Player, "INTERACTIONCHECK", 653);
            };
            casinoEnterCol.OnEntityExitColShape += (ColShape shape, Player Player) =>
            {
                NAPI.Data.SetEntityData(Player, "INTERACTIONCHECK", 0);
            };

            var casinoExitCol = NAPI.ColShape.CreateCylinderColShape(casinoExit, 2, 2);
            casinoExitCol.OnEntityEnterColShape += (ColShape shape, Player Player) =>
            {
                NAPI.Data.SetEntityData(Player, "INTERACTIONCHECK", 654);
            };
            casinoExitCol.OnEntityExitColShape += (ColShape shape, Player Player) =>
            {
                NAPI.Data.SetEntityData(Player, "INTERACTIONCHECK", 0);
            };



            var prizeCol = NAPI.ColShape.CreateCylinderColShape(new Vector3(1087.3715, 219.1609, -50.320377), 2, 2);
            prizeCol.OnEntityEnterColShape += (ColShape shape, Player Player) =>
            {
                NAPI.Data.SetEntityData(Player, "INTERACTIONCHECK", 655);
                Trigger.ClientEvent(Player, "client_press_key_to", "open", JsonConvert.SerializeObject(new List<object>() { "E", "получить приз" }));
            };
            prizeCol.OnEntityExitColShape += (ColShape shape, Player Player) =>
            {
                NAPI.Data.SetEntityData(Player, "INTERACTIONCHECK", 0);
                Trigger.ClientEvent(Player, "client_press_key_to", "close");
            };

            var spinWheel = NAPI.ColShape.CreateCylinderColShape(new Vector3(1110.2363, 227.8508, -50.755817), 1, 2);
            spinWheel.OnEntityEnterColShape += (ColShape shape, Player Player) =>
            {
                NAPI.Data.SetEntityData(Player, "INTERACTIONCHECK", 656);
                Trigger.ClientEvent(Player, "client_press_key_to", "open", JsonConvert.SerializeObject(new List<object>() { "E", "крутить колесо фортуны"  }));
            };
            spinWheel.OnEntityExitColShape += (ColShape shape, Player Player) =>
            {
                NAPI.Data.SetEntityData(Player, "INTERACTIONCHECK", 0);
                Trigger.ClientEvent(Player, "client_press_key_to", "close");
            };


            //Console.WriteLine(colShape.Position);
            blip = NAPI.Blip.CreateBlip(blipID, blipPosition, 1, blipColor, blipName, 255, 0, true);
            //Console.WriteLine(blip.Position);
            // NAPI.Marker.CreateMarker(21, colPosition, new Vector3(), new Vector3(), 0.8f, new Color(255, 255, 255, 60));
            // NAPI.TextLabel.CreateTextLabel("~y~Нажмите E чтобы начать играть", colPosition + new Vector3(0, 0, 0.3), 5F, 0.3F, 0, new Color(255, 255, 255));

            Vector3 _wheelPos = new Vector3(1109.76, 227.89, -49.64);
            Vector3 _baseWheelPos = new Vector3(1111.05, 229.81, -50.38);

            uint model = NAPI.Util.GetHashKey("vw_prop_vw_luckywheel_02a");
            uint baseWheelModel = NAPI.Util.GetHashKey("vw_prop_vw_luckywheel_01a");

            // bWheel = NAPI.Object.CreateObject(baseWheelModel, _baseWheelPos, new Vector3());
            Wheel = NAPI.Object.CreateObject(model, _baseWheelPos + new Vector3(0, 0, 1.25), new Vector3());

            NAPI.Vehicle.CreateVehicle(NAPI.Util.GetHashKey(PrizeVehicleHash), new Vector3(1100.062, 219.9683, -42.56709), 310.266f, 150, 154);

            NAPI.Entity.SetEntityRotation(Wheel, new Vector3(0, 0, 0));

            NAPI.Marker.CreateMarker(29, new Vector3(1115.912, 219.99, -49.55512), new Vector3(), new Vector3(), 1, new Color(128, 0, 130, 175));
            var col = NAPI.ColShape.CreateCylinderColShape(new Vector3(1115.912, 219.99, -49.55512), 2f, 2f);
            col.OnEntityEnterColShape += (sahpe, player) =>
            {
                player.SetData("INTERACTIONCHECK", 662);
                Trigger.ClientEvent(player, "client_press_key_to", "open", JsonConvert.SerializeObject(new List<object>() { "E", "купить/продать фишки" }));
            };
            col.OnEntityExitColShape += (sahpe, player) =>
            {
                player.SetData("INTERACTIONCHECK", 0);
                Trigger.ClientEvent(player, "client_press_key_to", "close");
            };

            for (int i = 0; i < RouletteTables.Count; i++)
            {
                var colshape = NAPI.ColShape.CreateCylinderColShape(RouletteTables[i], 2, 2);
                colshape.SetData("TABLE", i);
                colshape.OnEntityEnterColShape += (shape, player) =>
                {
                    player.SetData("INTERACTIONCHECK", 664);
                    player.SetData("TABLE", shape.GetData<int>("TABLE"));
                    Trigger.ClientEvent(player, "client_press_key_to", "open", JsonConvert.SerializeObject(new List<object>() { "E", "сесть за стол" }));
                };
                colshape.OnEntityExitColShape += (shape, player) =>
                {
                    player.SetData("INTERACTIONCHECK", 0);
                    player.ResetData("TABLE");
                    Trigger.ClientEvent(player, "client_press_key_to", "close");
                };
            }


            for (int i = 0; i < 2; i++)
            {
                
                Thread thd = new Thread(new ParameterizedThreadStart(StartRoulette));
                thd.Start(i);
                CasinoThreads.Add(thd);
                
            }
        }

        [ServerEvent(Event.ResourceStop)]
        public static void Stop()
        {
            for (int i = 0; i < CasinoThreads.Count; i++)
                CasinoThreads[i].Abort();
        }

        // [Command("spin")]
        public static void Spin(int table)
        {
            Random rand = new Random();

            int num = rand.Next(-1, 37);
            RouletteNum[table] = num;

            //if(num == -1) player.SendChatMessage($"Выпадет 00");
            //else player.SendChatMessage($"Выпадет {num}");
            Trigger.ClientEventInRange(RouletteTables[table], 50, "spin_wheel", table, 3, $"exit_{RouletteNumbers[num]}_wheel", $"exit_{RouletteNumbers[num]}_ball");
        }

        public static void OpenCashier(Player player)
        {
            player.SetData("DIALOG_BUYCHIPS", 1);
            Trigger.ClientEvent(player, "openDialogNpc", "Кассир", "Что вы хотите сделать?", new List<string> { "Купить фишки", "Обменять фишки", "Назад" });
        }

        public static void OpenBuyChips(Player player)
        {
            player.SetData("DIALOG_BUYCHIPS", 2);
            Trigger.ClientEvent(player, "openDialogNpc", "Кассир", $"Сколько вам нужно? Курс {ChipPrice}$ = 1 фишка", new List<string> { "10", "100", "1000", "Назад" });
        }

        public static void OpenSellChips(Player player)
        {
            player.SetData("DIALOG_BUYCHIPS", 3);
            Trigger.ClientEvent(player, "openDialogNpc", "Кассир", $"Сколько хотите обменять? Курс 1 фишка = {ChipPrice}$", new List<string> { "10", "100", "1000", "Назад" });
        }

        public static void BuyChips(Player player, int amount)
        {
            int price = amount * ChipPrice;

            if (Main.Players[player].Money < price)
            {
                Notify.Send(player, NotifyType.Error, NotifyPosition.BottomCenter, "Недостаточно средств", 3000);
                return;
            }

            int tryAdd = nInventory.TryAdd(player, new nItem(ItemType.CasinoChips, amount));

            if (tryAdd == -1 || tryAdd == -2)
            {
                Notify.Send(player, NotifyType.Error, NotifyPosition.BottomCenter, "Недостаточно места в инвентаре", 3000);
                return;
            }
            Wallet.Change(player, -price);

            nInventory.Add(player, new nItem(ItemType.CasinoChips, count: amount, null));

            Notify.Send(player, NotifyType.Success, NotifyPosition.BottomCenter, $"Вы купили {amount} фишек за {price}$", 3000);

            OpenBuyChipsMenu(player);
        }


        public static void SellChips(Player player, int amount)
        {
            int price = amount * ChipPrice;

            int emptyIndex = nInventory.FindIndex(NeptuneEvo.Main.Players[player].UUID, ItemType.CasinoChips);

            if (emptyIndex <= 0)
            {
                Notify.Send(player, NotifyType.Error, NotifyPosition.BottomCenter, "Недостаточно фишек", 3000);
                return;
            }

            if (nInventory.Items[Main.Players[player].UUID][emptyIndex].Count < amount)
            {
                Notify.Send(player, NotifyType.Error, NotifyPosition.BottomCenter, "Недостаточно фишек", 3000);
                return;
            }

            /*if (Main.Players[player].Money < price)
            {
                Notify.Send(player, NotifyType.Error, NotifyPosition.BottomCenter, "Недостаточно средств", 3000);
                return;
            }*/

            Wallet.Change(player, price);
            nInventory.Remove(player, ItemType.CasinoChips, amount);

            Notify.Send(player, NotifyType.Success, NotifyPosition.BottomCenter, $"Вы продали {amount} фишек за {price}$", 3000);

            OpenChangeChipsMenu(player);
        }


        public static void Roulette(Player player, int tb)
        {
            player.SetData("RL_TABLE", tb);
            player.SetData("RL_BET", 0);
            player.SetData("RL_SETBET", RouletteTableBetMin[tb]);

            RouletteSeatsPlayers[tb].Add(player);
        }

        [RemoteEvent("server_make_roulette_bet")]
        public static void MakeRouletteBet(Player player, int spot)
        {
            if (RouletteStatus[player.GetData<int>("RL_TABLE")] != 0)
            {
                return;
            }

            RlBet(player, spot, player.GetData<int>("RL_SETBET"));
        }

        public static void RlBet(Player player, int spot, int chips)
        {
            if (!player.HasData("RL_TABLE"))
                return;

            int table = player.GetData<int>("RL_TABLE");

            if (RouletteStatus[table] != 0)
            {
                Notify.Send(player, NotifyType.Error, NotifyPosition.BottomCenter, "В данный момент нельзя сделать ставку", 3000);
                return;
            }

            player.SetData("RL_WIN", 0);

            var item = nInventory.Find(Main.Players[player].UUID, ItemType.CasinoChips);

            if(item == null)
            {
                Notify.Send(player, NotifyType.Error, NotifyPosition.BottomCenter, "У Вас недостаточно фишек", 3000);
                return;
            }
            if (item.Count < chips)
            {
                Notify.Send(player, NotifyType.Error, NotifyPosition.BottomCenter, "У Вас недостаточно фишек", 3000);
                return;
            }

            if (!RoulettePlayers[player.GetData<int>("RL_TABLE")].Contains(player))
                RoulettePlayers[player.GetData<int>("RL_TABLE")].Add(player);

            nInventory.Remove(player, ItemType.CasinoChips, chips);
            RouletteBets[player.GetData<int>("RL_TABLE")].Add(new Bet(player, chips, spot));
            Notify.Send(player, NotifyType.Success, NotifyPosition.BottomCenter, $"Вы сделали ставку в размере {chips} фишек", 3000);
            UpdateCasinoChipsGUI(player);
            Trigger.ClientEvent(player, "bet_roulette", player.GetData<int>("RL_TABLE"), spot);
            //Trigger.ClientEvent(player, "seat_to_blackjack_table", 1, 0);
        }

        [RemoteEvent("serverSetRouletteBet")]
        public static void SetBet(Player player, int val)
        {
            if (!player.HasData("RL_TABLE"))
                return;

            player.SetData("RL_SETBET", val);

            //Trigger.ClientEvent(player, "client_casino_bet", "close");
            Notify.Send(player, NotifyType.Info, NotifyPosition.BottomCenter, $"Вы установили ставку в размере {val} фишек. Что бы изменить ставку, нажмите Ё", 3000);

        }

        [RemoteEvent("serverChangeRouletteBet")]
        public static void CahngeBet(Player player)
        {
            if (!player.HasData("RL_TABLE"))
                return;


            int table = player.GetData<int>("RL_TABLE");

          

            if (RouletteStatus[table] != 0)
                return;

            //Trigger.ClientEvent(player, "client_casino_bet", "open", JsonConvert.SerializeObject(new List<object>() { RouletteTableBetMin[table], player.GetData<int>("RL_SETBET"), RouletteTableBetMax[table] }));

        }

        public static int GetAllChips(Player player)
        {

            var item = nInventory.Find(Main.Players[player].UUID, ItemType.CasinoChips);

            int count = 0;

            if (item != null)
            {
                count = item.Count;
            }

            return count;

        }

        public static void SeatAtRoulette(Player player, int table)
        {
            if (player.HasData("RL_TABLE"))
            {
                ExitRoulette(player);
                return;
            }

            Trigger.ClientEvent(player, "client_press_key_to", "close");

            Roulette(player, table);

            Trigger.ClientEvent(player, "seat_to_roulette_table", table);
            Trigger.ClientEvent(player, "client_casino_bet", "open", JsonConvert.SerializeObject(new List<object>() { RouletteTableBetMin[table], RouletteTableBetMin[table], RouletteTableBetMax[table], GetAllChips(player)}));
            //Trigger.ClientEvent(player, "seat_to_blackjack_table", 1, 0);
        }

        public static void UpdateCasinoTimeGUI(Player player)
        {
            if (!player.HasData("RL_TABLE"))
            {
               
                return;
            }
            int tb = player.GetData<int>("TABLE");

            Trigger.ClientEvent(player, "updateCasinoTime", RouletteBetTime[tb]);
        }

        public static void UpdateCasinoChipsGUI(Player player)
        {
            if (!player.HasData("RL_TABLE"))
            {

                return;
            }
            int tb = player.GetData<int>("TABLE");

            Trigger.ClientEvent(player, "updateCasinoChips", GetAllChips(player));
        }

        [Command("rexit")]
        public static void ExitRoulette(Player player)
        {

            if (player.HasData("RL_TABLE"))
            {
                if (RoulettePlayers[player.GetData<int>("RL_TABLE")].Contains(player))
                    return;

                RouletteSeatsPlayers[player.GetData<int>("RL_TABLE")].Remove(player);
                Trigger.ClientEvent(player , "exit_roulette");
                Trigger.ClientEvent(player, "client_casino_bet", "close", "");
                player.ResetData("RL_TABLE");
                return;
            }
        }

        public static void StartRoulette(object table)
        {
            int tb = Convert.ToInt32(table);
           
            while (true)
            {
                if (RouletteBetTime[tb] != 0)
                {
                    try
                    {
                        if (RouletteSeatsPlayers[tb].Count != 0)
                        {
                            for (int i = 0; i < RouletteSeatsPlayers[tb].Count; i++)
                            {
                                UpdateCasinoTimeGUI(RouletteSeatsPlayers[tb][i]);
                            }
                        }

                        RouletteBetTime[tb] -= 1;

                        Thread.Sleep(1000);

                        if (RouletteBetTime[tb] != 0)
                            continue;
                    }
                    catch (Exception ex)
                    {
                        Log.Debug(ex.Message);
                    }
                }

                if (RoulettePlayers[tb].Count == 0 && RouletteBetTime[tb] == 0)
                {
                    RouletteBetTime[tb] = 30;
                    Thread.Sleep(1000);
                    continue;
                }

                for (int i = 0; i < RouletteSeatsPlayers[tb].Count; i++)
                {
                    UpdateCasinoTimeGUI(RouletteSeatsPlayers[tb][i]);
                }

                RouletteStatus[tb] = 1;

                Spin(tb);

                for (int i = 0; i < RoulettePlayers[tb].Count; i++)
                {
                    try
                    {
                        Trigger.ClientEvent(RoulettePlayers[tb][i], "start_roulette");
                        //Notify.Send(RoulettePlayers[tb][i], NotifyType.Info, NotifyPosition.BottomCenter, "Ставки приняты", 3000);
                    }
                    catch (Exception e)
                    {
                        Log.Debug(e.Message);
                    }
                }

                Thread.Sleep(25000);

                for (int i = 0; i < RoulettePlayers[tb].Count; i++)
                {

                    try
                    {
                        Trigger.ClientEvent(RoulettePlayers[tb][i], "stop_roulette");
                    }
                    catch (Exception e)
                    {
                        Log.Debug(e.Message);
                    }
                }

                Trigger.ClientEventInRange(RouletteTables[tb], 40, "clean_chips", tb);

                foreach (Bet bet in RouletteBets[tb])
                {
                    if (Spots[bet.Spot].Contains(RouletteNum[tb]))
                    {
                        int mnoj = 2;

                        if (bet.Spot <= 37)
                            mnoj = 15;
                        else if (bet.Spot >= 38 && bet.Spot <= 95)
                            mnoj = 7;
                        else if (bet.Spot >= 96 && bet.Spot <= 107)
                            mnoj = 4;
                        else if (bet.Spot >= 108 && bet.Spot <= 129)
                            mnoj = 3;
                        else if (bet.Spot >= 130)
                            mnoj = 2;

                        bet.Player.SetData("RL_WIN", bet.Player.GetData<int>("RL_WIN") + (bet.BetAmount * mnoj));
                    }
                }

                for (int i = 0; i < RoulettePlayers[tb].Count; i++)
                {

                    try
                    {

                        string winStr = "";

                        if (RouletteNum[tb] == -1)
                            winStr = "00";
                        else
                            winStr = $"{RouletteNum[tb]}";

                        if (RoulettePlayers[tb][i].GetData<int>("RL_WIN") <= 0)
                        {
                            Notify.Send(RoulettePlayers[tb][i], NotifyType.Info, NotifyPosition.BottomCenter, $"Выпало: {winStr}. Ваши ставки проиграли", 3000);
                        }
                        else
                        {
                            int prize = RoulettePlayers[tb][i].GetData<int>("RL_WIN");
                            Notify.Send(RoulettePlayers[tb][i], NotifyType.Info, NotifyPosition.BottomCenter, $"Выпало: {winStr}. Вы выиграли {prize} фишек!", 3000);
                            nInventory.Add(RoulettePlayers[tb][i], new nItem(ItemType.CasinoChips, prize));
                            //GameLog.Money($"player({Main.Players[RoulettePlayers[tb][i]].UUID})", $"CasinoRoulleteWin", prize, $"");
                        }
                        UpdateCasinoChipsGUI(RoulettePlayers[tb][i]);
                        RoulettePlayers[tb][i].SetData("RL_WIN", 0);

                    }
                    catch (Exception e)
                    {
                        Log.Debug(e.Message);
                    }
                }

                RouletteBets[tb].Clear();
                RoulettePlayers[tb].Clear();
                RouletteStatus[tb] = 0;

                Thread.Sleep(2000);
            }
        }

        /*
        public static int GetPrize()
        {
            Random rand = new Random();

            int val = rand.Next(0, 20);

   

        }
        */
        public static void Roll()
        {
            int speedIntCnt = 1;

            Random rand = new Random();
            int _priceIndex = rand.Next(1, 20);
            int _winAngle = (_priceIndex - 1) * 18;


            float _rollAngle = _winAngle + (360 * 8);
            float _midLength = (_rollAngle / 2);
            float rollspeed = 1;

            while (speedIntCnt > 0)
            {
                var retval = NAPI.Entity.GetEntityRotation(Wheel);

                if (_rollAngle > _midLength)
                    speedIntCnt++;
                else
                {


                    speedIntCnt--;
                    if (speedIntCnt < 0)
                        speedIntCnt = 0;
                }


                rollspeed = speedIntCnt / 10f;

                float _y = retval.Y - rollspeed;
                _rollAngle -= rollspeed;

                if (rollspeed == 0)
                {
                    if (_rollAngle < 20 && _rollAngle > 0)
                    {
                        while (_rollAngle > 0)
                        {
                            var pos = NAPI.Entity.GetEntityRotation(Wheel);
                            _y = _rollAngle > 1 ? pos.Y - 0.2f : pos.Y - 0.1f;
                            NAPI.Entity.SetEntityRotation(Wheel, new Vector3(0.0, _y, 0.0));
                            _rollAngle -= _rollAngle > 1 ? 0.2f : 0.1f;
                            Thread.Sleep(15);
                        }
                    }
                    else if (_rollAngle > -20 && _rollAngle < 0)
                    {
                        while (_rollAngle < 0)
                        {
                            var pos = NAPI.Entity.GetEntityRotation(Wheel);
                            _y = _rollAngle < -1 ? pos.Y + 0.2f : pos.Y + 0.1f;
                            NAPI.Entity.SetEntityRotation(Wheel, new Vector3(0.0, _y, 0.0));
                            _rollAngle += _rollAngle < -1 ? 0.2f : 0.1f;
                            Thread.Sleep(15);
                        }
                    }
                }


                NAPI.Entity.SetEntityRotation(Wheel, new Vector3(0.0, _y, 0.0));
                Thread.Sleep(15);
            }

            

            try
            {
                EndRoll(_priceIndex);
            }
            catch (Exception e)
            {
                Log.Debug(e.Message);
            }
            //NAPI.Entity.SetEntityRotation(Wheel, new Vector3(0.0, _winAngle, 0.0));
            isRoll = false;
        }

        //[Command("roll")]
        public static void RollWheel(Player player)
        {

            Trigger.ClientEvent(player, "client_press_key_to", "close");
            if(Main.Players[player].LastSpinWheel > DateTime.Now.AddHours(-4))
            {
                TimeSpan dates = DateTime.Now - Main.Players[player].LastSpinWheel;

                int minutess = (60 * 4) - Convert.ToInt32(dates.TotalMinutes);
                int hourss = Convert.ToInt32(minutess / 60);

                Notify.Send(player, NotifyType.Error, NotifyPosition.BottomCenter, $"Следующий спин возможен через {minutess} минут", 3000);

                Trigger.ClientEvent(player, "showFortune", hourss, Convert.ToInt32(minutess - (hourss * 60)));

                return;
            }

            if (isRoll)
                return;

            NAPI.Entity.SetEntityRotation(Wheel, new Vector3(0, 0, 0));
            isRoll = true;
            rollPlayer = player;
            Main.Players[player].LastSpinWheel = DateTime.Now;

            TimeSpan date = DateTime.Now - Main.Players[player].LastSpinWheel;

            int minutes = (60 * 4) - Convert.ToInt32(date.TotalMinutes);
            int hours = Convert.ToInt32(minutes / 60);

            Trigger.ClientEvent(player, "showFortune", hours, Convert.ToInt32(minutes - (hours * 60)));

            Trigger.ClientEventInRange(player.Position, 150f, "luckyWheel", player.Handle);
        }

        [RemoteEvent("startRoll")]
        public static void startRoll(Player player)
        {

            NAPI.Entity.SetEntityRotation(Wheel, new Vector3(0, 0, 0));
            isRoll = true;

            Main.Players[player].LastSpinWheel = DateTime.Now;

            Thread thread1 = new Thread(Roll);
            thread1.Start();

            rollPlayer = player;
        }

        /*
        [Command("tsts")]
        public static void RollWheels(Player player)
        {
            Trigger.ClientEventInRange(player.Position, 150f, "luckyWheel", player.Handle);
        }*/

        public static async void EndRoll(int prize)
        {
            try
            {
                Trigger.ClientEvent(rollPlayer, "delWheelCam");

                Main.Players[rollPlayer].Prize = WheelPrizes[prize];

                Notify.Send(rollPlayer, NotifyType.Info, NotifyPosition.BottomCenter, $"Вы выиграли {PrizesType[WheelPrizes[prize]]}. Забрать можно у NPC на выходе.", 3000);
                //GivePrize(rollPlayer, prize);

                await Commands.CMD_chatMe(rollPlayer, $"выиграл {PrizesType[WheelPrizes[prize]]}");

               

            }
            catch(Exception e)
            {
            }

            rollPlayer = null;

        }


        public static void GivePrize(Player player)
        {
            Trigger.ClientEvent(player, "client_press_key_to", "close");

            if(Main.Players[player].Prize == -1 || Main.Players[player].Prize == 0)
            {
                Notify.Send(player, NotifyType.Error, NotifyPosition.BottomCenter, "Вы уже забрали приз", 3000);
                return;
            }


            switch (Main.Players[player].Prize)
            {
                case 1:
                    GiveRandomEat(player);
                    break;
                case 2:
                    GiveRandomMoney(player);
                    break;
                case 3:
                    GiveRandomClothes(player);
                    break;
                case 4:
                    GiveRandomDonate(player);
                    break;
                case 5:
                    GiveRandomCar(player);
                    return;
                case 6:
                    Random rand = new Random();
                    int val = rand.Next(1, 5);
                    Main.Players[player].Prize = val;
                    GivePrize(player);
                    break;
            }

            Main.Players[player].Prize = -1;
        }

        public static void GiveRandomCar(Player player)
        {

            //
            Random rand = new Random();

            int car = rand.Next(0, PrizesCar.Count);

            string carName = PrizesCar[car];

            var house = NeptuneEvo.Houses.HouseManager.GetHouse(player, true);
            if (house == null)
            {
                Notify.Send(player, NotifyType.Error, NotifyPosition.BottomCenter, "Что бы забрать машину вам нужен дом с гаражем!", 3000);
                return;
            }
            else if(house.GarageID == 0)
            {
                Notify.Send(player, NotifyType.Error, NotifyPosition.BottomCenter, "У вашего дома нет гаража!", 3000);
                return;
            }
            else
            {
                var garage = NeptuneEvo.Houses.GarageManager.Garages[house.GarageID];
                // Проверка свободного места в гараже
                if (VehicleManager.getAllPlayerVehicles(player.Name).Count >= NeptuneEvo.Houses.GarageManager.GarageTypes[garage.Type].MaxCars)
                {
                    Notify.Send(player, NotifyType.Error, NotifyPosition.BottomCenter, $"Ваши гаражи полны", 3000);
                    return;
                }
                string vNumber = VehicleManager.Create(player.Name, carName, new Color(255, 255, 255), new Color(255, 255, 255), new Color(0, 0, 0));
                if (vNumber != "none")
                {
                    garage.SpawnCar(vNumber);
                    Notify.Send(player, NotifyType.Success, NotifyPosition.BottomCenter, $"Ваша {carName} доставлена в гараж!", 3000);
                    Main.Players[player].Prize = -1;
                }
            }

            //   Notify.Send(player, NotifyType.Success, NotifyPosition.BottomCenter, $"Вы получили {}", 3000);

        }

        public static void GiveRandomMoney(Player player)
        {
            Random rand = new Random();

            int money = rand.Next(500, 5001);

            Wallet.Change(player, money);
            Notify.Send(player, NotifyType.Success, NotifyPosition.BottomCenter, $"Вы получили {money}$", 3000);

            return;
        }

        public static void GiveRandomEat(Player player)
        {
            Random rand = new Random();

            int type = rand.Next(0, 8);

            ItemType item = ItemType.eCola;

            switch (type)
            {
                case 0:
                    item = ItemType.eCola;
                    break;
                case 1:
                    item = ItemType.Burger;
                    break;
                case 2:
                    item = ItemType.HotDog;
                    break;
                case 3:
                    item = ItemType.Sandwich;
                    break;
                case 4:
                    item = ItemType.Pizza;
                    break;
                case 5:
                    item = ItemType.Beer;
                    break;
                case 6:
                    item = ItemType.Sandwich;
                    break;
                case 7:
                    item = ItemType.RusDrink1;
                    break;
               
            }

            Notify.Send(player, NotifyType.Success, NotifyPosition.BottomCenter, $"Вы получили {nInventory.ItemsNames[(int)item]}", 3000);

            nInventory.Add(player, new nItem(item, 1));

            return;
        }

        public static void GiveRandomClothes(Player player)
        {
            Random rand = new Random();

            int type = rand.Next(0, 5);

            switch (type)
            {
                case 0:
                    Customization.AddClothes(player, ItemType.Top, 19, 1);
                    break;
                case 1:
                    Customization.AddClothes(player, ItemType.Top, 40, 0);
                    break;
                case 2:
                    Customization.AddClothes(player, ItemType.Top, 75, 0);
                    break;
                case 3:
                    Customization.AddClothes(player, ItemType.Top, 75,1);
                    break;
                case 4:
                    Customization.AddClothes(player, ItemType.Top, 78, 0);
                    break;

            }

            Notify.Send(player, NotifyType.Success, NotifyPosition.BottomCenter, $"Вы получили {nInventory.ItemsNames[(int)ItemType.Top]}", 3000);

            return;
        }

        public static void GiveRandomDonate(Player player)
        {
            Random rand = new Random();

            int val = rand.Next(20, 50);

            Main.Accounts[player].RedBucks += val;

            Notify.Send(player, NotifyType.Success, NotifyPosition.BottomCenter, $"Вы получили {val} Redbucks", 3000);

            Trigger.ClientEvent(player, "redset", Main.Accounts[player].RedBucks);

            return;
        }

        public static void EnterCasino(Player player)
        {
            NAPI.Entity.SetEntityPosition(player, casinoExit + new Vector3(0.0, 0.0, 1.2));
        }

        public static void ExitCasino(Player player)
        {
            NAPI.Entity.SetEntityPosition(player, casinoEnter + new Vector3(0.0, 0.0, 1.2));
        }

        [ServerEvent(Event.PlayerDeath)]
        public void OnPlayerDeath(Player player, Player killer, uint reason)
        {
            if (PlayersList.ContainsKey(player))
            {
                NAPI.ClientEvent.TriggerClientEvent(player, "rouletecfg", 5, 0, 0); // Обычно CaEnd работает после того как клиент его закроет изнутри, но при смерти нужно закрыть со стороны сервера
            }
        }

        public static void OpenChipsMenu(Player player)
        {
            Trigger.ClientEvent(player, "client_press_key_to", "close");

            Menu menu = new Menu("chipsmenu", false, false);
            menu.Callback = callback_chipsmenu;

            Menu.Item menuItem = new Menu.Item("header", Menu.MenuItem.Header);
            menuItem.Text = "Казино";
            menu.Add(menuItem);

            menuItem = new Menu.Item("buychips", Menu.MenuItem.Button);
            menuItem.Text = $"Купить фишки";
            menu.Add(menuItem);

            menuItem = new Menu.Item("changechips", Menu.MenuItem.Button);
            menuItem.Text = $"Обменять фишки";
            menu.Add(menuItem);

            menuItem = new Menu.Item("close", Menu.MenuItem.Button);
            menuItem.Text = "Закрыть";
            menu.Add(menuItem);

            menu.Open(player);
        }

        private static void callback_chipsmenu(Player client, Menu menu, Menu.Item item, string eventName, dynamic data)
        {
            MenuManager.Close(client);
            if (item.ID == "close") return;
            switch (item.ID)
            {
                case "buychips":
                    OpenBuyChipsMenu(client);
                    break;
                case "changechips":
                    OpenChangeChipsMenu(client);
                    break;
            }
            return;
        }

        public static void OpenBuyChipsMenu(Player player)
        {
            Menu menu = new Menu("buychipsmenu", false, false);
            menu.Callback = callback_buychipsmenu;

            Menu.Item menuItem = new Menu.Item("header", Menu.MenuItem.Header);
            menuItem.Text = $"Курс: {ChipPrice}$ = 1 фишка";
            menu.Add(menuItem);

            menuItem = new Menu.Item("b1", Menu.MenuItem.Button);
            menuItem.Text = $"10 фишек";
            menu.Add(menuItem);

            menuItem = new Menu.Item("b2", Menu.MenuItem.Button);
            menuItem.Text = $"100 фишек";
            menu.Add(menuItem);

            menuItem = new Menu.Item("b3", Menu.MenuItem.Button);
            menuItem.Text = $"1000 фишек";
            menu.Add(menuItem);

            menuItem = new Menu.Item("back", Menu.MenuItem.Button);
            menuItem.Text = "Назад";
            menu.Add(menuItem);

            menu.Open(player);
        }

        private static void callback_buychipsmenu(Player client, Menu menu, Menu.Item item, string eventName, dynamic data)
        {
            MenuManager.Close(client);
            if (item.ID == "back")
            {
                OpenChipsMenu(client);
                return;
            }
            switch (item.ID)
            {
                case "b1":
                    MenuManager.Close(client);
                    BuyChips(client, 10);
                    break;
                case "b2":
                    MenuManager.Close(client);
                    BuyChips(client, 100);
                    break;
                case "b3":
                    MenuManager.Close(client);
                    BuyChips(client, 1000);
                    break;
            }
            return;
        }

        public static void OpenChangeChipsMenu(Player player)
        {
            Menu menu = new Menu("changechipsmenu", false, false);
            menu.Callback = callback_changechipsmenu;

            Menu.Item menuItem = new Menu.Item("header", Menu.MenuItem.Header);
            menuItem.Text = $"Курс: 1 фишка = {ChipPrice}$";
            menu.Add(menuItem);

            menuItem = new Menu.Item("b1", Menu.MenuItem.Button);
            menuItem.Text = $"10 фишек";
            menu.Add(menuItem);

            menuItem = new Menu.Item("b2", Menu.MenuItem.Button);
            menuItem.Text = $"100 фишек";
            menu.Add(menuItem);

            menuItem = new Menu.Item("b3", Menu.MenuItem.Button);
            menuItem.Text = $"1000 фишек";
            menu.Add(menuItem);

            menuItem = new Menu.Item("back", Menu.MenuItem.Button);
            menuItem.Text = "Назад";
            menu.Add(menuItem);

            menu.Open(player);
        }

        private static void callback_changechipsmenu(Player client, Menu menu, Menu.Item item, string eventName, dynamic data)
        {
            MenuManager.Close(client);
            if (item.ID == "back")
            {
                OpenChipsMenu(client);
                return;
            }
            switch (item.ID)
            {
                case "b1":
                    MenuManager.Close(client);
                    SellChips(client, 10);
                    break;
                case "b2":
                    MenuManager.Close(client);
                    SellChips(client, 100);
                    break;
                case "b3":
                    MenuManager.Close(client);
                    SellChips(client, 1000);
                    break;
            }
            return;
        }

        /*
        [RemoteEvent("PlacedBet")]
        public static void PlacedBet(Player player, ushort red, ushort zero, ushort black)
        {
            try
            {// Тут только добавляем к переменным действующие ставки, снимать со счёта будем в тот момент, когда ставки закроются, в CasinoState 1
                if(CasinoState == 0)
                {
                    if (red + zero + black <= 50000)
                    { // Такая же проверка стоит и на клиенте, на 1 игру ставка максимум 50000 за одну игру
                        long mymoney = Main.Players[player].Money - red - zero - black;
                        if (mymoney >= 0)
                        { // Такая же проверка стоит и на клиенте, но лучше пусть 2 раза перепроверит, что у игрока достаточно денег в банке для игры
                            PlayersList[player] = (red, zero, black);
                        }
                    }
                }
            } catch(Exception e)
            {
                Log.Write("PlacedBet: " + e.ToString(), nLog.Type.Error);
            }
        }

        [RemoteEvent("End")]
        public static void CaEnd(Player player, byte type)
        { // Либо закрыл казино сам, либо PlayerDeath, либо PlayerDisconnected
            if (PlayersList.ContainsKey(player))
            {
                player.Dimension = 0;
                if (CasinoState >= 1)
                { // Если ставки были закрыты
                    ushort cred = PlayersList[player].Item1;
                    ushort czero = PlayersList[player].Item2;
                    ushort cblack = PlayersList[player].Item3;
                    if (cred >= 1 || czero >= 1 || cblack >= 1)
                    { 
                        if (type >= 1)
                        {
                            Main.Players[player].Money += cred + czero + cblack;
                            GameLog.Money("casino", $"player({Main.Players[player].UUID})", (cred + czero + cblack), $"type{type}");
                        }
                    }
                }
                GameLog.CasinoEnd(player.Name, Main.Players[player].UUID, CasinoState, type);
                PlayersList.Remove(player);
                if (PlayersList.Count == 0 && CasinoT != null)
                {
                    Timers.Stop(CasinoT);
                    CTime = 45;
                    CasinoState = 0;
                }
            }
        }

        public static void Interact(Player Player)
        {
            if (!PlayersList.ContainsKey(Player))
            {
                if (Main.Players[Player].Money < minBalance)
                {
                    Notify.Send(Player, NotifyType.Warning, NotifyPosition.BottomCenter, $"Для игры необходимо иметь баланс больше {minBalance}$", 4000);
                    return;
                }

                if (PlayersList.Count == 0) CasinoT = Timers.StartTask("CasinoT", 5000, CasinoTick); // Если это первый игрок, то запускаем таймер казино с задержкой в 5 секунд
                Player.Dimension = (uint)(Player.Value + 1);
                PlayersList.Add(Player, (0, 0, 0)); // Добавляем игрока в лист игроков
                                                    // Заменить переменную на ту, что держит кол-во денег в банке у player, Обновляем в UI количество реальных денег со счёта
                Trigger.ClientEvent(Player, "startroulete", CTime, CasinoState, Main.Players[Player].Money);
            }
        }
        public static void Disconnect(Player Player, DisconnectionType type)
        {
            if (PlayersList.ContainsKey(Player)) CaEnd(Player, (byte)type);
        }

        private static void CasinoTick()
        { // Один таймер для всего, чтобы у всех была 1 игра, а не у каждого своя.
            if (PlayersList.Count == 0) {
                Timers.Stop(CasinoT);
                CTime = 45;
                CasinoState = 0;
            } else {
                CTime -= 5;
                if (CTime == 5)
                {
                    if (CasinoState == 0)
                    { // Первая позиция, в которой идёт отсчёт до момента кручения рулетки, ставки доступны.
                        CasinoState = 1;
                        foreach (Player target in PlayersList.Keys)
                        {
                            Trigger.ClientEvent(target, "rouletecfg", 1, 0, -1);
                        }
                    }
                }
                else if (CTime == 0)
                {
                    if (CasinoState == 1)
                    { // Вторая позиция, в которой идёт отсчёт до момента кручения рулетки, ставки закрыты.
                        CasinoState = 2;
                        CTime = 10;
                        WinNum = random.Next(0, 37); // всего цифр на циферблате 37 (0 + 36), 37 цифр прокрутить это сделать ровно 1 оборот
                        int num = random.Next(1, 11); // от 1 до 10 кругов будет происходить оборот + до нужной цифры
                        lock(PlayersList)
                        {
                            foreach (Player target in PlayersList.Keys)
                            {
                                NAPI.Task.Run(() =>
                                {
                                    try
                                    {
                                        NAPI.ClientEvent.TriggerClientEvent(target, "rouletecfg", 0, ((num * 37) + webnums[WinNum]), 0);
                                        // Забираем со счёта все активные ставки
                                        ushort cred = PlayersList[target].Item1;
                                        ushort czero = PlayersList[target].Item2;
                                        ushort cblack = PlayersList[target].Item3;
                                        Wallet.Change(target, -(cred + czero + cblack));

                                        GameLog.CasinoPlacedBet(target.Name, Main.Players[target].UUID, cred, czero, cblack);
                                        GameLog.Money($"player({Main.Players[target].UUID})", "casino", (cred + czero + cblack), "placedBet");
                                    } catch(Exception e)
                                    {
                                        Log.Write("CasinoTick: " + e.ToString(), nLog.Type.Error);
                                    }
                                });
                            }
                        }
                    }
                    else if (CasinoState == 2)
                    { // Третья позиция, в которой рулетка крутится, ставки открываются после того, как рулетка докрутится
                        if (WinNum == 0) CasinoWinLoseUpdate(0);
                        else
                        {
                            for (byte i = 0; i != 18; i++)
                            {
                                if (rednums[i] == WinNum)
                                { // RED
                                    CasinoWinLoseUpdate(1);
                                    break;
                                }
                                else if (i == 17) CasinoWinLoseUpdate(2); // BLACK
                            }
                        }
                        CTime = 45;
                        CasinoState = 0;
                    }
                }
                SendTimeAndState();
            }
        }

        private static void CasinoWinLoseUpdate(byte index)
        { // Выдаем деньги победителям
            int wonbet;
            lock(PlayersList)
            {
                foreach (Player target in PlayersList.Keys)
                {
                    wonbet = 0;
                    NAPI.Task.Run(() =>
                    {
                        try
                        {
                            if (index == 0)
                            {
                                wonbet = PlayersList[target].Item2;
                                if (wonbet >= 1)
                                {
                                    wonbet = wonbet * 14;
                                    Wallet.Change(target, wonbet);
                                    GameLog.Money("casino", $"player({Main.Players[target].UUID})", wonbet, "winZero");
                                }
                            }
                            else if (index == 1)
                            {
                                wonbet = PlayersList[target].Item1;
                                if (wonbet >= 1)
                                {
                                    wonbet = wonbet * 2;
                                    Wallet.Change(target, wonbet);
                                    GameLog.Money("casino", $"player({Main.Players[target].UUID})", wonbet, "winRed");
                                }
                            }
                            else if (index == 2)
                            {
                                wonbet = PlayersList[target].Item3;
                                if (wonbet >= 1)
                                {
                                    wonbet = wonbet * 2;
                                    Wallet.Change(target, wonbet);
                                    GameLog.Money("casino", $"player({Main.Players[target].UUID})", wonbet, "winBlack");
                                }
                            }
                            // Отсылаем всем игрокам их новые суммы в банке и данные об выигрыше в UI, если он есть.
                            NAPI.ClientEvent.TriggerClientEvent(target, "rouletecfg", 4, wonbet, Main.Players[target].Money);
                            // Аннулируем все активные ставки по серверу
                            PlayersList[target] = (0, 0, 0);

                            GameLog.CasinoWinLose(target.Name, Main.Players[target].UUID, wonbet);
                        }
                        catch(Exception e)
                        {
                            Log.Write("CasinoWinLoseUpdate: " + e.ToString(), nLog.Type.Error);
                        }
                    });
                }
            }
        }

        private static void SendTimeAndState()
        { // Каждые 5 секунд обновляем у игроков время и state в их UI 
            foreach (Player target in PlayersList.Keys)
            {
                //NAPI.ClientEvent.TriggerClientEvent(target, "rouletecfg", 2, CTime, CasinoState);
                Trigger.ClientEvent(target, "rouletecfg", 2, CTime, CasinoState);
            }
        }

        private static int CheckBank(string nickname)
        {
            //Не эффективно, требуется рефактор
            List<Bank.Data> all = Bank.Accounts.Values.ToList();

            Bank.Data acc = all.FirstOrDefault(d => d.Type == 4 && d.Holder == nickname);

            if (acc != null) return acc.ID;
            
            return 0;
        }*/

    }



    class Bet
    {
        public Player Player;
        public int BetAmount = 0;
        public int Spot;

        public Bet(Player player, int money, int spot)
        {
            Player = player;
            BetAmount = money;
            Spot = spot;
        }
    }
}
