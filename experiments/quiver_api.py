import os
import quiverquant
import pandas as pd

API_TOKEN = os.environ.get("QUIVER_API_TOKEN", "")


def run_fixed_test():
    print("🔌 Connecting to Quiver Quant API...")
    try:
        quiver = quiverquant.quiver(API_TOKEN)

        # 1. 获取数据
        print("🔍 Fetching Congress Trading Data...")
        df = quiver.congress_trading()

        # -------------------------------------------------------
        # 🛠️ DEBUG: 先打印一下所有列名，确保不再猜盲盒
        # -------------------------------------------------------
        print(f"\n📋 Actual Columns found: {list(df.columns)}")

        # 2. 智能重命名 (以防万一)
        # 如果列名是 ReportDate (披露日) 或 TransactionDate (交易日)
        # 我们统一把它们当作 'Date' 来处理，方便后续排序
        if "ReportDate" in df.columns:
            df["Date"] = pd.to_datetime(df["ReportDate"])
        elif "TransactionDate" in df.columns:
            df["Date"] = pd.to_datetime(df["TransactionDate"])
        elif "Filed" in df.columns:  # 有时候也是这个名字
            df["Date"] = pd.to_datetime(df["Filed"])

        # 3. 筛选与展示
        # 现在的列名通常是: Representative, Ticker, Transaction, Amount, ReportDate
        target_cols = [
            "ReportDate",
            "Representative",
            "Ticker",
            "Transaction",
            "Amount",
        ]

        # 确保只选存在的列
        final_cols = [c for c in target_cols if c in df.columns]

        # 按日期降序（看最新的）
        if "Date" in df.columns:
            df = df.sort_values(by="Date", ascending=False)

        print(f"\n✅ Success! Top 5 Latest Trades:")
        print(df[final_cols].head(5).to_string(index=False))

        # 4. 再次测试佩洛西
        pelosi = df[df["Representative"].str.contains("Pelosi", case=False, na=False)]
        if not pelosi.empty:
            print(f"\n🚨 Pelosi Watch: Found {len(pelosi)} trades!")
            print(pelosi[final_cols].head(3).to_string(index=False))
        else:
            print("\n🤷 No recent Pelosi trades found.")

    except Exception as e:
        print(f"\n❌ Error: {e}")


if __name__ == "__main__":
    if not API_TOKEN:
        print("⚠️ 请设置环境变量 QUIVER_API_TOKEN")
    else:
        run_fixed_test()
