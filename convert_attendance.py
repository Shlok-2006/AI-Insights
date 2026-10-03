import json
from pathlib import Path
from datetime import date, datetime, time
import openpyxl

root = Path(__file__).resolve().parent
result = {"datasets": []}
for source in sorted(root.glob('*.xlsx')):
    workbook = openpyxl.load_workbook(source, data_only=True)
    dataset = {"source_file": source.name, "worksheets": []}
    for sheet in workbook.worksheets:
        rows = list(sheet.values)
        subjects = list(rows[1][3:])
        assert all(isinstance(s, str) for s in subjects)
        records = []
        for row in rows[2:]:
            if all(value is None for value in row):
                continue
            records.append({
                "Name": row[0],
                "Reg. No.": row[1],
                "Email": row[2],
                "Attendance Percentage": dict(zip(subjects, row[3:]))
            })
        dataset["worksheets"].append({"name": sheet.title, "record_count": len(records), "subjects": subjects, "records": records})
        for record, row in zip(records, (r for r in rows[2:] if any(v is not None for v in r))):
            assert [record['Name'], record['Reg. No.'], record['Email'], *record['Attendance Percentage'].values()] == list(row)
    result['datasets'].append(dataset)

output = root / 'attendance_data.json'
output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
assert json.loads(output.read_text(encoding='utf-8')) == result
for dataset in result['datasets']:
    for sheet in dataset['worksheets']:
        print(f"{dataset['source_file']} / {sheet['name']}: {sheet['record_count']} records verified")
print(f"Saved {output}")
