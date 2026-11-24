# Example Library

Under **Workbench → Build the Library → Example Library** you create, in one click, a small, consistent Library to look around in before you file your own documents: an invented family with contracts, invoices, insurance, deadlines and post. The area is already in the bar at the level **Beginner**.

![Workbench → Example Library](bilder/werkbank-beispielablage.png)

## What is created { #was-angelegt-wird }

The example Library consists of the **example folders of the installed packages**, including their example documents – the same ones a package creates on request when installed (see [Packages](pakete.md)). For this, Ablago fetches the installed version of the package from the catalogue again. The names are invented, addresses and domains reserved (`example.org`).

- **Required** are the packages *Basis*, *Household* and *Contracts*. If one is missing, the page says so, and the button **Create example Library** stays locked until it is installed.
- **Added**, if installed, are the examples of *Invoices*, *House* and *Vehicles*.
- Packages that already have examples stay as they are – nothing is created twice.
- The example folders trigger **no automations and no notifications**, as when installing.
- If a package cannot be fetched (for instance without internet), the message says so; the examples of the other packages are there anyway.

As long as there are example folders, the [overview](uebersicht.md) reminds you – with a button to the example Library.

## Removing it again { #wieder-entfernen }

**Remove example Library** removes, after a confirmation, all **unchanged** example folders with their documents permanently, without the bin, with an entry in the deletion log. **Your own data stays untouched.** An example you changed or that one of your own folders links to also stays and is named in the message – you can keep it or delete it yourself.

## In the setup wizard { #im-einrichtungsassistenten }

Under **Optional → Examples** the wizard asks its only question about examples: **Start with an example Library**. It needs the packages Basis, Household and Contracts among the chosen packages. With **Set up now** Ablago then creates the example Library right after the packages.

!!! info "Example Library or load test data?"
    The example Library is for **looking at**: few, consistent folders. For measurements with many thousands of folders there is the [load test data](demo.md) (formerly "demo data"), only at the level *Everything*.
